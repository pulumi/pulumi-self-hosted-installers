import * as azuread from "@pulumi/azuread";
import * as random from "@pulumi/random";
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { Output, ComponentResourceOptions } from "@pulumi/pulumi";
import { tenantId } from "@pulumi/azure-native/config";
import { subscription } from "@pulumi/azure-native/types/enums";

export class ActiveDirectoryApplication extends pulumi.ComponentResource {
  public readonly GroupId: Output<string>;
  public readonly ApplicationId: Output<string>;
  public readonly ApplicationSecret: Output<string>;
  public readonly TenantId: Output<string>;
  public readonly SubscriptionId: Output<string>;
  public readonly ApplicationObjectId: Output<string>;
  public readonly PrincipalServerObjectId: Output<string>;
  constructor(name: string, opts?: ComponentResourceOptions) {
    super("x:infrastructure:activedirectoryapplication", name, opts);

    const clientConfig = azure.authorization.getClientConfig();
    const currentPrincipal = clientConfig.then((x) => x.objectId);
    const currentTenantId = clientConfig.then(x => x.tenantId);
    const currentSubscriptionId = clientConfig.then(x => x.subscriptionId);

    const applicationServer = new azuread.Application(`${name}-app-server`, {
      displayName: `${name}-app-server`,
    }, {parent: this});

    const principalServer = new azuread.ServicePrincipal(`${name}-sp-server`, {
      applicationId: applicationServer.applicationId,
    }, {parent: applicationServer});

    const adminGroup = new azuread.Group(`${name}-ad-admingroup`, {
        displayName: `${name}-ad-admingroup`,
        members: [currentPrincipal, principalServer.objectId],
      }, {parent: this});

    const passwordServer = new random.RandomPassword(`${name}-pwd-server`, {
      length: 20,
      special: true
    }, {additionalSecretOutputs: ["result"], parent: this}).result;

    const spPasswordServer = new azuread.ServicePrincipalPassword(`${name}-sppwd-server`,{
        servicePrincipalId: principalServer.id,
        value: passwordServer,
        endDate: "2099-01-01T00:00:00Z",
      }, {parent: principalServer});

    this.GroupId = adminGroup.id;
    this.ApplicationId = applicationServer.applicationId;
    this.ApplicationSecret = spPasswordServer.value;
    this.TenantId = pulumi.output(currentTenantId);
    this.SubscriptionId = pulumi.output(currentSubscriptionId);
    this.ApplicationObjectId = applicationServer.objectId;
    this.PrincipalServerObjectId = principalServer.objectId;

    this.registerOutputs({
        GroupId: this.GroupId,
        ApplicationId: this.ApplicationId,
        ApplicationSecret: this.ApplicationSecret,
        TenantId: this.TenantId,
        SubscriptionId: this.SubscriptionId,
        ApplicationObjectId: this.ApplicationObjectId,
        PrincipalServerObjectId: this.PrincipalServerObjectId
    });
  }
}
