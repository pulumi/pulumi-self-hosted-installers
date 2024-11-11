import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

export type RdsDatabaseOptions = {
    privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
    securityGroupId: pulumi.Input<string>;
    replicas: number;
    instanceType: pulumi.Input<string>;
    databaseMonitoringRoleArn: pulumi.Input<string>;
};

export class RdsDatabase extends pulumi.ComponentResource {
    public readonly dbSubnets: aws.rds.SubnetGroup;
    public readonly db: aws.rds.Cluster;
    public readonly password: pulumi.Output<string>;

    constructor(
        name: string,
        args: RdsDatabaseOptions,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super("selfhosted:RdsDatabase", name, args, opts);

        // Generate a strong password.
        this.password = new random.RandomPassword(`${name}-password`, {
            length: 16,
            overrideSpecial: "_",
            special: true,
        }, {additionalSecretOutputs: ["result"]}).result;

        // Create the database and its properties. 
        // Based on https://git.io/JvitC

        const tags = { "Project": "pulumi-k8s-aws-cluster", "Owner": "pulumi"};

        this.dbSubnets = new aws.rds.SubnetGroup(`${name}-subnets`, {
            subnetIds: args.privateSubnetIds,    // Same subnets as EKS nodes.
            tags,
        });

        const finalSnapshotIdentifier = new random.RandomId(`${name}-final-snapshot-identifier`, {
            prefix: "snapshot-",
            byteLength: 6,
        });

        const engine = "aurora-mysql";
        const engineVersion = "8.0.mysql_aurora.3.07.1";

        let engineMode: aws.rds.EngineMode | undefined;
        this.db = new aws.rds.Cluster(`${name}-cluster`, {
            backupRetentionPeriod: 7,  // days
            databaseName: "pulumi",
            copyTagsToSnapshot: true,
            dbSubnetGroupName: this.dbSubnets.id,
            engine: engine,
            engineVersion,
            engineMode: engineMode,
            masterUsername: "pulumi",
            masterPassword: this.password,
            storageEncrypted: true,
            // vpcSecurityGroupIds: [args.securityGroupId],         // Must be able to communicate with EKS nodes.
            vpcSecurityGroupIds: pulumi.output(args.securityGroupId).apply(id => [id]),        // Must be able to communicate with EKS nodes.
            finalSnapshotIdentifier: finalSnapshotIdentifier.hex,
            tags,
        }, { protect: true, });

        let databaseInstanceOptions = new aws.rds.ParameterGroup("database-instance-options", {
            family: "aurora-mysql8.0",
            parameters: [
                // Enable the general and slow query logs and write them to files on the RDS instance.
                { name: "slow_query_log", value: "1" },
                { name: "long_query_time", value: "4.9" },
                { name: "log_queries_not_using_indexes", value: "1" },
                { name: "general_log", value: "1" },
                { name: "log_output", value: "FILE" },
            ],
            tags,
        });

        // Add a second database instance. This ensures we have instances
        // spread across multiple AZs. If there is a problem with the primary instance, Aurora will
        // do an automated failover. We can also manually fail-over ourselves via the AWS Console.
        //
        // See: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html
        // for more information on how Auora handles failover and read replicas.
        let instancesToCreate: string[] = [];
        for (let i = 0; i < args.replicas; i++) {
            instancesToCreate.push(`databaseInstance-${i}`);
        }
        for (const name of instancesToCreate) {
            new aws.rds.ClusterInstance(
                name,
                {
                    clusterIdentifier: this.db.id,
                    engine,
                    engineVersion,
                    instanceClass: args.instanceType,
                    dbParameterGroupName: databaseInstanceOptions.name,
                    monitoringInterval: 5,
                    monitoringRoleArn: args.databaseMonitoringRoleArn,
                    tags,
                },
                { protect: true },

            );
        }
    }
}
