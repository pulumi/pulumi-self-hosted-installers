import { Application, Group, ServicePrincipal, ServicePrincipalPassword } from "@pulumi/azuread";
import { Output, ComponentResource, ComponentResourceOptions, output } from "@pulumi/pulumi";
import { authorization } from "@pulumi/azure-native";

export class ActiveDirectoryApplication extends ComponentResource {
  public readonly GroupId: Output<string>;
  public readonly ApplicationId: Output<string>;
  public readonly ApplicationSecret: Output<string>;
  public readonly TenantId: Output<string>;
  public readonly SubscriptionId: Output<string>;
  public readonly ApplicationObjectId: Output<string>;
  public readonly PrincipalServerObjectId: Output<string>;
  constructor(name: string, opts?: ComponentResourceOptions) {
    super("x:infrastructure:activedirectoryapplication", name, opts);

    const clientConfig = authorization.getClientConfig();
    const currentPrincipal = clientConfig.then((x) => x.objectId);
    const currentTenantId = clientConfig.then(x => x.tenantId);
    const currentSubscriptionId = clientConfig.then(x => x.subscriptionId);

    const applicationServer = new Application(`${name}-app-server`, {
      displayName: `${name}-app-server`,
    }, { parent: this });

    const principalServer = new ServicePrincipal(`${name}-sp-server`, {
      applicationId: applicationServer.applicationId,
    }, { parent: applicationServer });

    const adminGroup = new Group(`${name}-ad-admingroup`, {
      displayName: `${name}-ad-admingroup`,
      members: [currentPrincipal, principalServer.objectId],
    }, { parent: this });

    const spPasswordServer = new ServicePrincipalPassword(`${name}-sppwd-server`, {
      servicePrincipalId: principalServer.id,
      endDate: "2099-01-01T00:00:00Z",
    }, { parent: principalServer });

    this.GroupId = adminGroup.id;
    this.ApplicationId = applicationServer.applicationId;
    this.ApplicationSecret = spPasswordServer.value;
    this.TenantId = output(currentTenantId);
    this.SubscriptionId = output(currentSubscriptionId);
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
