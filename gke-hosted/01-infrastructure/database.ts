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
    DatabaseKmsKeyId: Output<string>;
    constructor(name: string, args: DatabaseArgs, opts?: ComponentResourceOptions) {
        super("x:infrastructure:database", name, opts);

        // Get region from GCP provider config
        const region = gcp.config.region;
        if (!region) {
            throw new Error("GCP region must be configured (gcp:region)");
        }

        // Create KMS key ring for database encryption (regional for best practices)
        const keyRing = new gcp.kms.KeyRing(`${name}-db-keyring`, {
            location: region,
        }, { parent: this });

        // Create KMS key for database encryption with 90-day rotation (industry standard)
        const dbKmsKey = new gcp.kms.CryptoKey(`${name}-db-encryption-key`, {
            keyRing: keyRing.id,
            rotationPeriod: "7776000s", // 90 days (industry standard for database encryption keys)
            purpose: "ENCRYPT_DECRYPT",
            labels: args.tags,
        }, { parent: this });

        // Grant Cloud SQL service account access to KMS key
        const project = gcp.organizations.getProject({});
        const sqlServiceAccount = project.then(proj =>
            `service-${proj.number}@gcp-sa-cloud-sql.iam.gserviceaccount.com`
        );

        // Use IAMMember for additive IAM binding (doesn't replace existing members)
        const kmsBinding = new gcp.kms.CryptoKeyIAMMember(`${name}-db-kms-member`, {
            cryptoKeyId: dbKmsKey.id,
            role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
            member: pulumi.interpolate`serviceAccount:${sqlServiceAccount}`,
        }, { parent: this });

        const dbInstance = new gcp.sql.DatabaseInstance(`${name}-db`, {
            region: region,
            databaseVersion: "MYSQL_8_0",
            settings: {
                tier: args.dbInstanceType,
                ipConfiguration: {
                    ipv4Enabled: false,
                    privateNetwork: args.vpcId,
                    sslMode: "ENCRYPTED_ONLY",
                },
                databaseFlags: [
                    // Slow query log for performance tuning (minimal overhead)
                    { name: "slow_query_log", value: "on" },
                    { name: "log_output", value: "FILE" },
                    { name: "long_query_time", value: "2" },
                    // General log only if explicitly enabled (10-30% performance impact)
                    ...(args.enableGeneralLog ? [{ name: "general_log", value: "on" }] : [])
                ],
                // Configure encrypted backups
                backupConfiguration: {
                    enabled: true,
                    startTime: "03:00",
                    pointInTimeRecoveryEnabled: true,
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
            deletionProtection: true,
            encryptionKeyName: dbKmsKey.id,
        }, { parent: this, protect: true, dependsOn: [kmsBinding] });

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
        this.DatabaseKmsKeyId = dbKmsKey.id;
        this.registerOutputs({
            DatabaseConnectionString: this.DatabaseConnectionString,
            DatabaseLogin: this.DatabaseLogin,
            DatabasePassword: this.DatabasePassword,
            DatabaseName: this.DatabaseName,
            DatabaseServerName: this.DatabaseServerName,
            DatabaseKmsKeyId: this.DatabaseKmsKeyId,
        });
    }
}
