import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";

export type RdsDatabaseOptions = {
    privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
    securityGroupId: pulumi.Input<string>;
    replicas: pulumi.Input<number>;
    instanceType: pulumi.Input<string>;
};

const pulumiComponentNamespace: string = "pulumi:RdsDatabase";

export class RdsDatabase extends pulumi.ComponentResource {
    public readonly dbSubnets: aws.rds.SubnetGroup;
    public readonly db: aws.rds.Cluster;
    public readonly password: pulumi.Output<string>;

    constructor(
        name: string,
        args: RdsDatabaseOptions,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(pulumiComponentNamespace, name, args, opts);

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

        let engineMode: aws.rds.EngineMode | undefined;
        this.db = new aws.rds.Cluster(`${name}-cluster`, {
            backupRetentionPeriod: 7,  // days
            databaseName: "pulumi",
            copyTagsToSnapshot: true,
            dbSubnetGroupName: this.dbSubnets.id,
            engine: "aurora",
            engineMode: engineMode,
            masterUsername: "pulumi",
            masterPassword: this.password,
            storageEncrypted: true,
            vpcSecurityGroupIds: [args.securityGroupId],         // Must be able to communicate with EKS nodes.
            finalSnapshotIdentifier: finalSnapshotIdentifier.hex,
            tags,
        }, { protect: true, });

        let databaseInstanceOptions = new aws.rds.ParameterGroup("database-instance-options", {
            family: "aurora5.6",
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

        // See https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Monitoring.OS.html.
        let databaseMonitoringRole = new aws.iam.Role("databaseInstanceMonitoringRole", {
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "monitoring.rds.amazonaws.com" }),
            tags,
        });
        let databaseMonitoringRolePolicy = new aws.iam.RolePolicyAttachment("databaseInstanceMonitoringRolePolicy", {
            role: databaseMonitoringRole,
            // value is not found: policyArn: aws.iam.AmazonRDSEnhancedMonitoringRole,
            policyArn: "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
        });

        // Add a second database instance. This ensures we have instances
        // spread across multiple AZs. If there is a problem with the primary instance, Aurora will
        // do an automated failover. We can also manually fail-over ourselves via the AWS Console.
        //
        // See: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html
        // for more information on how Auora handles failover and read replicas.
        const instancesToCreate = [];
        for (let i = 0; i < args.replicas; i++) {
            instancesToCreate.push(`databaseInstance-${i}`);
        }
        for (const name of instancesToCreate) {
            let databaseInstance = new aws.rds.ClusterInstance(
                name,
                {
                    clusterIdentifier: this.db.id,
                    instanceClass: args.instanceType,
                    dbParameterGroupName: databaseInstanceOptions.name,
                    monitoringInterval: 5,
                    monitoringRoleArn: databaseMonitoringRole.arn,
                    tags,
                },
                { dependsOn: [databaseMonitoringRolePolicy], protect: true },
            );
        }
    }
}
