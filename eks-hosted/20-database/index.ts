import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";
import { RdsDatabase } from "./rds-db";

interface DbConn {
    host: pulumi.Output<string> | string 
    port: pulumi.Output<string> | string 
    username: pulumi.Output<string> | string 
    password: pulumi.Output<string> 
}

// Deploy RDS Aurora DB if not using an existing database.
let dbConn: DbConn 
if (config.dbHostEndpoint && config.dbPort && config.dbUsername && config.dbPassword) {
    // Use existing DB info
    dbConn = {
        host: config.dbHostEndpoint,
        port: config.dbPort,
        username: config.dbUsername,
        password: config.dbPassword,
    }
} else {
    // Create a new RDS Aurora DB.
    const rds = new RdsDatabase("rds-aurora-db", {
        privateSubnetIds: config.privateSubnetIds,
        securityGroupId : config.nodeSecurityGroupId,
        databaseMonitoringRoleArn: config.databaseMonitoringRoleArn,
        replicas: config.dbReplicas,
        instanceType: config.dbInstanceType,
    });
    const db = rds.db;

    // Export the DB connection information.

    dbConn = {
        host: db.endpoint,
        port: db.port.apply(port => port.toString()),
        username: db.masterUsername,
        password: rds.password, // db.masterPassword can possibly be undefined. Use rds.password instead.
    };
}

export { dbConn };
