import { ComponentResource, ComponentResourceOptions, Output, Input, interpolate } from "@pulumi/pulumi";
import { authorization, managedidentity, network } from "@pulumi/azure-native";

export interface IdentityArgs {
    azureDnsZone: Output<string>;
    azureDnsZoneResourceGroup: Output<string>;
    certManagerName: Output<string>;
    certManagerNamespaceName: Output<string>;
    clusterOidcIssuerUrl: Output<string | undefined>;
    nodeResourceGroupName: Output<string | undefined>;
    tags?: Input<{
        [key: string]: Input<string>;
    }>,
}

export class Identity extends ComponentResource {
    public readonly ClientId: Output<string>;
    constructor(name: string, args: IdentityArgs, opts?: ComponentResourceOptions) {
        super("x:kubernetes:identity", name, args, opts);

        const resourceGroupName = assertValue(args.nodeResourceGroupName, "nodeResourceGroup");
        const issuerUrl = assertValue(args.clusterOidcIssuerUrl, "oidcIssuerUrl");

        const dnsZone = network.getZoneOutput({
            zoneName: args.azureDnsZone,
            resourceGroupName: args.azureDnsZoneResourceGroup
        });

        const user = new managedidentity.UserAssignedIdentity(`${name}-managed-id`, {
            resourceGroupName: resourceGroupName,
            tags: args.tags,
        }, { parent: this });

        new authorization.RoleAssignment(`${name}-role-assignment`, {
            roleDefinitionId: "/providers/Microsoft.Authorization/roleDefinitions/befefa01-2a29-4197-83a8-272ff33ce314",
            scope: dnsZone.id,
            principalId: user.principalId,
            principalType: "ServicePrincipal"
        }, { parent: this });

        new managedidentity.FederatedIdentityCredential(`${name}-federated-cred`, {
            resourceName: user.name,
            resourceGroupName: resourceGroupName,
            issuer: issuerUrl,
            subject: interpolate `system:serviceaccount:${args.certManagerNamespaceName}:${args.certManagerName}`,
            audiences: ["api://AzureADTokenExchange"],
        }, { parent: this });

        this.ClientId = user.clientId;
    }
}

const assertValue = (val: Output<string | undefined>, name: string) => {
    return val.apply(v => {
        if (!v) {
            throw new Error(`${name} must not be undefined`);
        }

        return v!;
    });
}