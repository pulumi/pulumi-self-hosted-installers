import {
    ECSClient,
    ListTasksCommand,
    RunTaskCommand,
    DescribeTasksCommand,
    waitUntilTasksRunning,
    waitUntilTasksStopped,
} from "@aws-sdk/client-ecs";
import * as pulumi from "@pulumi/pulumi";

export class DatabaseMigrationTask {

    private readonly client: ECSClient;
    constructor(region: string) {
        this.client = new ECSClient({ region });
    }

    // entry point to start the ECS Fargate migrations task
    async runMigrationTask(clusterId: string, securityGroupId: string, subnetId: string, taskFamilyArn: string, taskFamily: string): Promise<void> {

        // the db migrations requires it to be a singleton; one and only one task should be running at a time.
        await this.assertNoTasksRunning(clusterId, taskFamily);

        // trigger the ECS fargate task
        const taskArn = await this.startMigrationTask(clusterId, taskFamilyArn, securityGroupId, subnetId);

        // wait for the task to start, run, and complete
        await this.waitForTaskCompletion(clusterId, taskArn);

        // assert the task was successful and did not exit with a non-zero code. if needed check Cloudwatch logs for details
        await this.assertDbMigrationSuccessful(clusterId, taskArn);
    }

    // we want to make sure only one migrations task is running, at a time. beware race conditions.
    async assertNoTasksRunning(clusterId: string, taskFamily: string): Promise<void> {

        pulumi.log.info(`Checking for executing ECS tasks for family ${taskFamily}`);

        const result = await this.client.send(new ListTasksCommand({
            cluster: clusterId,
            family: taskFamily,
            desiredStatus: "RUNNING",
        }));

        if (!result.taskArns || result.taskArns.length === 0) {
            pulumi.log.info("No executing tasks found in the running state");
            return;
        }

        const error = `At least one existing migration task already running: ${JSON.stringify(result.taskArns)}`;
        pulumi.log.error(error);
        throw new Error(error);
    }

    // once we've determined there are no other tasks running, go ahead and start one
    async startMigrationTask(clusterId: string, taskDefinitionArn: string, securityGroupId: string, subnetId: string): Promise<string> {

        const startTime = Date.now();
        const taskName = `DbMigration-${startTime}`;

        pulumi.log.info(`Attempting to start ${taskName} for DB migration`);

        const result = await this.client.send(new RunTaskCommand({
            cluster: clusterId,
            count: 1,
            group: taskName,
            taskDefinition: taskDefinitionArn,
            launchType: "FARGATE",
            networkConfiguration: {
                awsvpcConfiguration: {
                    assignPublicIp: "DISABLED",
                    securityGroups: [securityGroupId],
                    subnets: [subnetId],
                },
            },
        }));

        if (!result.tasks || !result.tasks[0].taskArn) {
            const error = "Unable to successfully start DB Migration task";
            pulumi.log.error(error);
            throw new Error(error);
        }

        return result.tasks[0].taskArn;
    }

    // once the task is running, wait until it completes, regardless of outcome.
    async waitForTaskCompletion(clusterId: string, taskArn: string): Promise<void> {

        pulumi.log.info(`Waiting for task ${taskArn} to start`);

        await waitUntilTasksRunning(
            { client: this.client, maxWaitTime: 300, minDelay: 10 },
            { cluster: clusterId, tasks: [taskArn] }
        );

        pulumi.log.info(`Task ${taskArn} successfully started. Now waiting for task completion`);

        await waitUntilTasksStopped(
            { client: this.client, maxWaitTime: 3600, minDelay: 30 },
            { cluster: clusterId, tasks: [taskArn] }
        );

        pulumi.log.info("Db Migration Task successfully completed");
    }

    // make sure we successfully completed
    async assertDbMigrationSuccessful(clusterId: string, taskArn: string) {

        const ecsTasks = await this.client.send(new DescribeTasksCommand({
            cluster: clusterId,
            tasks: [taskArn],
        }));

        if (!ecsTasks.tasks || !ecsTasks.tasks[0].containers) {
            const error = `Unable to located task ${taskArn}`;
            pulumi.log.error(error);
            throw new Error(error);
        }

        const exitCode = ecsTasks.tasks[0].containers[0].exitCode!;
        const stoppedReason = ecsTasks.tasks[0].stoppedReason;
        if (exitCode != 0) {
            const error = `DB migrations task exited with a non-zero code: ${exitCode} and reason: ${stoppedReason}. Check Cloudwatch Migrations LogGroup for details`;
            pulumi.log.error(error);
            throw new Error(error);
        }
    }
}
