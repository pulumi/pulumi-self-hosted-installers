import { dbformysql, network } from "@pulumi/azure-native";
import * as random from "@pulumi/random";
import { Input, Output, ComponentResource, ComponentResourceOptions, interpolate } from "@pulumi/pulumi";

export interface DatabaseArgs {
    resourceGroupName: Output<string>,
    vnetId: Output<string>,
    dbSubnetId: Output<string>,
    aksSubnetId: Output<string>,
    tags?: Input<{
        [key: string]: Input<string>;
    }>
}

export class Database extends ComponentResource {
    DatabaseEndpoint: Output<string | undefined>;
    DatabaseLogin: Output<string | undefined>;
    DatabasePassword: Output<string>;
    DatabaseName: Output<string>;
    DatabaseServerName: Output<string>;
    constructor(name: string, args: DatabaseArgs, opts?: ComponentResourceOptions) {
        super("x:infrastructure:database", name, opts);

        // to allow us to limit DB access to our VNET only, we'll use PrivateDNS
        // we require a unique server zone name to tie a PrivateDNS Zone to our DB
        const serverName = name;
        // const serverZoneName = `${serverName}.private.mysql.database.azure.com`
        const privateZone = new network.PrivateZone(`${name}-private-zone`, {
            resourceGroupName: args.resourceGroupName,
            privateZoneName: "private.mysql.database.azure.com",
            location: "global",
        }, { parent: this });

        // link our vnet and private DNS zone
        // MySQL server will automatically handle DNS needs for DB server
        const vnetLink = new network.VirtualNetworkLink(`${name}-private-link`, {
            resourceGroupName: args.resourceGroupName,
            privateZoneName: privateZone.name,
            registrationEnabled: false,
            location: "global",
            virtualNetwork: {
                id: args.vnetId,
            }
        }, { parent: this });

        const dbPassword = new random.RandomPassword(`${name}-dbpassword`, {
            length: 20,
            lower: true,
            upper: true,
            special: true,
        }, {
            parent: this,
            additionalSecretOutputs: ["result"],
        });

        // It is not explicit, but create a MySQL Flexible server (not single)
        const adminLogin = "pulumiadmin";
        const server = new dbformysql.Server(`${name}-mysql`, {
            administratorLogin: adminLogin,
            administratorLoginPassword: dbPassword.result,
            resourceGroupName: args.resourceGroupName,
            network: {
                delegatedSubnetResourceId: args.dbSubnetId,
                privateDnsZoneResourceId: privateZone.id,
            },
            storage: {
                storageSizeGB: 50,
                autoGrow: "Enabled",
            },
            version: "8.0.21",
            sku: {
                name: "Standard_D2ads_v5",
                tier: "GeneralPurpose",
            },
            tags: args.tags,
        }, {
            protect: true,
            parent: this,
            deleteBeforeReplace: true,
            dependsOn: [vnetLink]
        });

        // new dbformysql.Configuration(`${name}-disable-tls`, {
        //     resourceGroupName: args.resourceGroupName,
        //     serverName: server.name,  
        //     source: "user-override",
        //     configurationName: "require_secure_transport",
        //     value: "OFF",
        // }, { parent: server });

        // https://docs.microsoft.com/en-us/azure/mysql/howto-troubleshoot-common-errors#error-1419-you-do-not-have-the-super-privilege-and-binary-logging-is-enabled-you-might-want-to-use-the-less-safe-log_bin_trust_function_creators-variable
        new dbformysql.Configuration(`${name}-config`, {
            resourceGroupName: args.resourceGroupName,
            serverName: server.name,
            source: "user-override",
            configurationName: "log_bin_trust_function_creators",
            value: "ON",
        }, { parent: server });

        const db = new dbformysql.Database(`${name}-mysql`, {
            databaseName: "pulumi", // Must be named "pulumi".
            resourceGroupName: args.resourceGroupName,
            serverName: server.name,
        }, {
            parent: server,
            protect: true,
        });

        this.DatabaseEndpoint = interpolate `${server.name}.${privateZone.name}`;
        this.DatabaseLogin = server.administratorLogin;
        this.DatabasePassword = dbPassword.result;
        this.DatabaseName = db.name;
        this.DatabaseServerName = server.name;
        this.registerOutputs({
            DatabaseEndpoint: this.DatabaseEndpoint,
            DatabaseLogin: this.DatabaseLogin,
            DatabasePassword: this.DatabasePassword,
            DatabaseName: this.DatabaseName,
            DatabaseServerName: this.DatabaseServerName,
        });
    }

}
