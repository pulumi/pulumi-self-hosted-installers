import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";
import { Output, ComponentResourceOptions } from "@pulumi/pulumi";

export interface DatabaseArgs {
    dbInstanceType: string, 
    dbUser: string,
    tags?: pulumi.Input<{
        [key: string]: pulumi.Input<string>;
    }>,
}

export class Database extends pulumi.ComponentResource {
    DatabaseConnectionString: Output<string | undefined>;
    DatabaseLogin: Output<string | undefined>;
    DatabasePassword: Output<string>;
    DatabaseName: Output<string>;
    DatabaseServerName: Output<string>;
    constructor(name: string, args: DatabaseArgs, opts?: ComponentResourceOptions) {
        super("x:infrastructure:database", name, opts);

        // Generate a strong password.
        const password = new random.RandomPassword(`${name}-password`, {
            length: 20,
            lower: true,
            upper: true,
            special: true,
        }, {parent: this, additionalSecretOutputs: ["result"]}).result;
  
        const dbInstance = new gcp.sql.DatabaseInstance(`${name}-db`, {
            databaseVersion: "MYSQL_5_6",
            settings: {
                tier: args.dbInstanceType,
                ipConfiguration: {
                    authorizedNetworks: [{ value: "0.0.0.0/0" }],
                },
            },
            deletionProtection: false, //TESTING this makes it easier to spin up and down during testing. Final version will set it to true.
        }, {parent: this, protect: true});
  
        // Create a user with the configured credentials for the Rails app to use.
        const user = new gcp.sql.User(`${name}-dbuser`, {
            instance: dbInstance.name,
            name: args.dbUser,
            password: password,
        }, {parent: dbInstance, protect: true});

        const db = new gcp.sql.Database(`${name}-mysql`, {
            instance: dbInstance.name,
            name: "pulumi", // Must be named "pulumi".
        }, {parent: dbInstance, protect: true});

        this.DatabaseConnectionString = dbInstance.firstIpAddress;
        this.DatabaseLogin = user.name;
        this.DatabasePassword = password;
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
