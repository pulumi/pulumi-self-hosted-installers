import * as pulumi from "@pulumi/pulumi";
import * as rds from "@pulumi/aws/rds";
import * as ec2 from "@pulumi/aws/ec2";
import * as iam from "@pulumi/aws/iam";
import * as random from "@pulumi/random";

import { getIamPolicyArn } from "../common/utils";

const namespace = "pulumi:auroraDatabase";
const engine = "aurora-mysql";
const engineVersion = "8.0.mysql_aurora.3.07.0";
const dbOptionsFamily = "aurora-mysql8.0";

export interface DatabaseArgs {
    vpcId: string,
    isolatedSubnetIds: string[],
    numberDbReplicas: number,
    instanceType: string,
    region: string
}

export class Database extends pulumi.ComponentResource {

    public readonly dbClusterEndpoint: pulumi.Output<string>;
    public readonly dbName: pulumi.Output<string>;
    public readonly dbSecurityGroupId: pulumi.Output<string>;
    public readonly dbUsername: pulumi.Output<string>;
    public readonly dbPassword: pulumi.Output<string>;
    public readonly dbPort: pulumi.Output<number>;

    constructor(name: string, args: DatabaseArgs, opts?: pulumi.ComponentResourceOptions) {
        super(namespace, name, args, opts);

        const options = { parent: this };

        // don't allow any ingress by default; API service will need to create ingress for this sg.
        const securityGroup = new ec2.SecurityGroup(`${name}-sg`, {
            vpcId: args.vpcId,
        }, options);

        const subnetGroup = new rds.SubnetGroup(`${name}-subnet-group`, {
            subnetIds: args.isolatedSubnetIds
        }, options);

        const dbPassword = new random.RandomPassword(`${name}-password`, {
            length: 16,
            overrideSpecial: "_",
            special: true
        }, options);

        const finalSnapshotIdentifier = new random.RandomId(`${name}-snapshot-id`, {
            prefix: "snapshot-",
            byteLength: 6
        }, options);

        const cluster = new rds.Cluster(`${name}-aurora-cluster`, {
            applyImmediately: true,
            backupRetentionPeriod: 7, // days
            copyTagsToSnapshot: true,
            databaseName: "pulumi",
            dbSubnetGroupName: subnetGroup.id, // misleading...its ID not name
            deletionProtection: false,
            engine: engine,
            engineVersion: engineVersion,
            finalSnapshotIdentifier: finalSnapshotIdentifier.hex,
            masterUsername: "pulumi",
            masterPassword: dbPassword.result,
            storageEncrypted: true,
            vpcSecurityGroupIds: [securityGroup.id],
        }, pulumi.mergeOptions(options, { protect: true }));

        const databaseInstanceOptions = new rds.ParameterGroup(`${name}-instance-options`, {
            family: dbOptionsFamily,
            parameters: [
                // Enable the general and slow query logs and write them to files on the RDS instance.
                { name: "slow_query_log", value: "1" },
                { name: "long_query_time", value: "4.9" },
                { name: "log_queries_not_using_indexes", value: "1" },
                { name: "general_log", value: "1" },
                { name: "log_output", value: "FILE" },
            ],
        }, options);

        // See https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Monitoring.OS.html.
        const databaseMonitoringRole = new iam.Role(`${name}-instance-monitoring-role`, {
            assumeRolePolicy: iam.assumeRolePolicyForPrincipal({ Service: "monitoring.rds.amazonaws.com" }),
        }, options);

        // govcloud policy arns are different from non-govcloud
        const monitoringPolicyArn = getIamPolicyArn(args.region, "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole");

        new iam.RolePolicyAttachment(`${name}-instance-monitoring-rp`, {
            role: databaseMonitoringRole,
            policyArn: monitoringPolicyArn
        }, options);

        // instances

        // Add a second database instance. This ensures we have instances
        // spread across multiple AZs. If there is a problem with the primary instance, Aurora will
        // do an automated failover. We can also manually fail-over ourselves via the AWS Console.
        //
        // See: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html
        // for more information on how Auora handles failover and read replicas.

        // max is 3 instances (1 master, 2 replica)
        if (args.numberDbReplicas > 2) {
            throw new Error("Number DB Replicas cannot be greater than 2");
        }

        if (args.numberDbReplicas < 0) {
            throw new Error("Number DB Replicas cannot be less than 0");
        }

        // the '1' accounts for our master instance
        const numberInstances = args.numberDbReplicas + 1;
        for (let i = 0; i < numberInstances; i++) {

            new rds.ClusterInstance(`${name}-instance-${i}`, {
                clusterIdentifier: cluster.id,
                engine: engine,
                engineVersion: engineVersion,
                instanceClass: args.instanceType,
                dbParameterGroupName: databaseInstanceOptions.name,
                monitoringInterval: 5,
                monitoringRoleArn: databaseMonitoringRole.arn,
            },
                pulumi.mergeOptions(options, {
                    dependsOn: [databaseMonitoringRole],
                    protect: true
                })
            );
        }

        // output specific values to prevent any leaky abstractions
        this.dbClusterEndpoint = cluster.endpoint;
        this.dbName = cluster.databaseName;
        this.dbUsername = cluster.masterUsername;
        this.dbPassword = dbPassword.result;
        this.dbSecurityGroupId = securityGroup.id;
        this.dbPort = cluster.port;
    }
}