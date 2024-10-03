import * as pulumi from "@pulumi/pulumi";
import * as iam from "@pulumi/aws/iam";
import * as cloudwatch from "@pulumi/aws/cloudwatch";
import * as ecs from "@pulumi/aws/ecs";
import * as ec2 from "@pulumi/aws/ec2";

import { DatabaseMigrationTask } from "../databaseMigrationTask";
import { buildECRImageTag, generateSecretsManagerPolicy } from "../utils";
import { Secrets } from "./secrets";
import { MigrationsArgs } from "./types";
import { getIamPolicyArn } from "../../common/utils";

const namespace = "pulumi:dbMigrations";
const launchType = "FARGATE";
const networkMode = "awsvpc";
const cpu = 256;
const memoryReservation = 512;

export class MigrationService extends pulumi.ComponentResource {

    public readonly securityGroup: ec2.SecurityGroup;

    private readonly baseOptions: pulumi.ComponentResourceOptions;
    private readonly baseName: string;
    private readonly baseArgs: MigrationsArgs;

    constructor(name: string, args: MigrationsArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        this.baseArgs = args;
        this.baseOptions = pulumi.mergeOptions(opts, { parent: this });
        this.baseName = name;

        const image = `pulumi/migrations:${args.migrationsImageTag}`;

        const role = new iam.Role(`${name}-role`, {
            assumeRolePolicy: iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" })
        }, this.baseOptions);

        const ecsPolicyArn = getIamPolicyArn(this.baseArgs.region, iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy);
        pulumi.log.debug(`construct ecs task execution role policy arn: ${ecsPolicyArn}`);

        new iam.RolePolicyAttachment(`${name}-task-role-attachment`, {
            role: role,
            policyArn: ecsPolicyArn
        }, this.baseOptions);

        const doc = generateSecretsManagerPolicy(args.region, args.secretsManagerPrefix!, args.kmsServiceKeyId!, args.accountId);
        new iam.RolePolicy(`${this.baseName}-migration-secrets-pol`, {
            role: role,
            policy: doc
        }, this.baseOptions);

        this.securityGroup = new ec2.SecurityGroup(`${name}-sg`, {
            vpcId: args.vpcId,
            egress: [{
                fromPort: 0,
                toPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"]
            }],
        }, this.baseOptions);

        const cluster = new ecs.Cluster(`${name}-cluster`, {}, this.baseOptions);

        const taskDefinition = new ecs.TaskDefinition(`${name}-task-def`, {
            family: "pulumi-migration-task",
            networkMode: networkMode,
            cpu: cpu.toString(),
            memory: memoryReservation.toString(),
            requiresCompatibilities: [launchType],
            executionRoleArn: role.arn,
            containerDefinitions: this.constructContainerDefinitions(args, image)
        }, this.baseOptions);

        if (pulumi.runtime.isDryRun()) {
            console.log("Skipping database migration task on Pulumi Preview");

            return;
        }

        const taskMigration = new DatabaseMigrationTask(args.region);

        // create and trigger an ECS fargate task to run the db migrations
        // we are not using an ECS service as the service will attempt to restart exited containers. We only want one execution per deployment.
        pulumi
            .all([
                cluster.id,
                this.securityGroup.id,
                args.privateSubnetIds[0],
                taskDefinition.arn,
                taskDefinition.family
            ])
            .apply(async ([clusterId, securityGroupId, subnetId, taskArn, taskFamily]) => {
                await taskMigration.runMigrationTask(clusterId, securityGroupId, subnetId, taskArn, taskFamily);
            });
    }

    constructContainerDefinitions(args: MigrationsArgs, image: string): pulumi.Output<string> {
        const { database } = args;

        const logGroup = new cloudwatch.LogGroup(`${this.baseName}-log-group`, {
            name: "pulumi-migration-logs",
            retentionInDays: 1
        }, this.baseOptions);

        const migrationSecrets = new Secrets("migration-secrets", {
            prefix: args.secretsManagerPrefix,
            kmsKeyId: args.kmsServiceKeyId,
            secrets: [
                {
                    name: "MYSQL_ROOT_USERNAME",
                    value: pulumi.secret(this.baseArgs.database.dbUsername)
                },
                {
                    name: "MYSQL_ROOT_PASSWORD",
                    value: pulumi.secret(this.baseArgs.database.dbPassword)
                }
            ]
        }, this.baseOptions);

        const definition = pulumi
            .all([
                args.accountId, 
                args.ecrRepoAccountId,
                database,
                migrationSecrets.outputs,
                logGroup.id])
            .apply(([
                accountId, 
                ecrRepoAccountId,
                database, 
                secrets, 
                logId]) => {
                const ecrAccountId = ecrRepoAccountId && ecrRepoAccountId !== "" ? ecrRepoAccountId : accountId;

                // TODO: follow log groups implementation
                return JSON.stringify([{
                    name: "pulumi-migration",
                    image: buildECRImageTag(ecrAccountId, args.region, image),
                    cpu: cpu,
                    memoryReservation: memoryReservation,
                    logConfiguration: {
                        logDriver: "awslogs",
                        // http://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html#w2ab1c21c21c13
                        options: {
                            "awslogs-region": args.region,
                            "awslogs-group": logId,
                            "awslogs-stream-prefix": "awslogs-pulumi-migration",
                        }
                    },
                    environment: [
                        {
                            name: "SKIP_CREATE_DB_USER",
                            value: "true"
                        },
                        {
                            name: "PULUMI_DATABASE_ENDPOINT",
                            value: `${database.dbClusterEndpoint}:${database.dbPort}`
                        },
                        {
                            name: "PULUMI_DATABASE_PING_ENDPOINT",
                            value: database.dbClusterEndpoint
                        }
                    ],
                    secrets: secrets
                }]);
            });

        return definition;
    }
}