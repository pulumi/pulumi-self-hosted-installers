import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";
import { Output, ComponentResourceOptions } from "@pulumi/pulumi";

export interface DatabaseArgs {
    vpcId: pulumi.Input<string>,
    dbInstanceType: string,
    dbUser: string,
    enableGeneralLog?: boolean,
    backupRetentionDays?: number,
    maintenanceDay?: number,
    maintenanceHour?: number,
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
}

export class Database extends pulumi.ComponentResource {
    DatabaseHost: Output<string | undefined>;
    DatabaseConnectionString: Output<string | undefined>;
    DatabaseLogin: Output<string | undefined>;
    DatabasePassword: Output<string>;
    DatabaseName: Output<string>;
    DatabaseServerName: Output<string>;
    constructor(name: string, args: DatabaseArgs, opts?: ComponentResourceOptions) {
        super("x:infrastructure:database", name, opts);

        // Get region from GCP provider config
        const region = gcp.config.region;
        if (!region) {
            throw new Error("GCP region must be configured (gcp:region)");
        }

        const dbInstance = new gcp.sql.DatabaseInstance(`${name}-db`, {
            region: region,
            databaseVersion: "MYSQL_8_0",
            settings: {
                tier: args.dbInstanceType,
                ipConfiguration: {
                    ipv4Enabled: false,
                    privateNetwork: args.vpcId,
                    sslMode: "ALLOW_UNENCRYPTED_AND_ENCRYPTED",
                },
                databaseFlags: [
                    // Slow query log for performance tuning (minimal overhead)
                    { name: "slow_query_log", value: "on" },
                    { name: "log_output", value: "FILE" },
                    { name: "long_query_time", value: "2" },
                    // General log only if explicitly enabled (10-30% performance impact)
                    ...(args.enableGeneralLog ? [{ name: "general_log", value: "on" }] : [])
                ],
                backupConfiguration: {
                    enabled: true,
                    startTime: "03:00",
                    binaryLogEnabled: true,
                    backupRetentionSettings: {
                        retainedBackups: args.backupRetentionDays || 30,
                        retentionUnit: "COUNT"
                    },
                    transactionLogRetentionDays: 7
                },
                maintenanceWindow: {
                    day: args.maintenanceDay || 1,
                    hour: args.maintenanceHour || 3,
                    updateTrack: "stable"
                },
                insightsConfig: {
                    queryInsightsEnabled: true,
                    queryPlansPerMinute: 5,
                    queryStringLength: 1024,
                    recordApplicationTags: true,
                    recordClientAddress: true
                }
            },
            deletionProtection: false,
        }, { parent: this, protect: true });

        // Create a user with the configured credentials and generated password for API service to use.
        const password = new random.RandomPassword(`${name}-dbpassword`, {
            length: 20,
            lower: true,
            upper: true,
            special: true,
        }, { parent: this, additionalSecretOutputs: ["result"] });

        const user = new gcp.sql.User(`${name}-dbuser`, {
            instance: dbInstance.name,
            name: args.dbUser,
            host: "%",
            password: password.result,
        }, { parent: dbInstance, protect: true });

        const db = new gcp.sql.Database(`${name}-mysql`, {
            instance: dbInstance.name,
            name: "pulumi", // Must be named "pulumi".
        }, { parent: dbInstance, protect: true });

        this.DatabaseHost = dbInstance.firstIpAddress
        this.DatabaseConnectionString = pulumi.interpolate`${dbInstance.firstIpAddress}:3306`;
        this.DatabaseLogin = user.name;
        this.DatabasePassword = password.result;
        this.DatabaseName = db.name;
        this.DatabaseServerName = dbInstance.name;
        this.registerOutputs({
            DatabaseConnectionString: this.DatabaseConnectionString,
            DatabaseLogin: this.DatabaseLogin,
            DatabasePassword: this.DatabasePassword,
            DatabaseName: this.DatabaseName,
            DatabaseServerName: this.DatabaseServerName,
        });
    }
}
