import { Application, Group, ServicePrincipal, ServicePrincipalPassword } from "@pulumi/azuread";
import { Output, ComponentResource, ComponentResourceOptions, output } from "@pulumi/pulumi";

export interface ActiveDirectoryApplicationArgs {
  userId: string;
}

export class ActiveDirectoryApplication extends ComponentResource {
  public readonly GroupId: Output<string>;
  public readonly ApplicationId: Output<string>;
  public readonly ApplicationSecret: Output<string>;
  public readonly ApplicationObjectId: Output<string>;
  public readonly PrincipalServerObjectId: Output<string>;
  constructor(name: string, args: ActiveDirectoryApplicationArgs, opts?: ComponentResourceOptions) {
    super("x:infrastructure:activedirectoryapplication", name, args, opts);

    const applicationServer = new Application(`${name}-app-server`, {
      displayName: `${name}-app-server`,
    }, { parent: this });

    const principalServer = new ServicePrincipal(`${name}-sp-server`, {
      clientId: applicationServer.clientId,
    }, { parent: applicationServer });

    const adminGroup = new Group(`${name}-ad-admingroup`, {
      displayName: `${name}-ad-admingroup`,
      mailEnabled: false,
      members: [args.userId, principalServer.objectId],
      securityEnabled: true,
    }, { parent: this });

    const spPasswordServer = new ServicePrincipalPassword(`${name}-sppwd-server`, {
      servicePrincipalId: principalServer.id,
      endDate: "2099-01-01T00:00:00Z",
    }, { parent: principalServer });

    this.GroupId = adminGroup.id;
    this.ApplicationId = applicationServer.clientId;
    this.ApplicationSecret = spPasswordServer.value;
    this.ApplicationObjectId = applicationServer.objectId;
    this.PrincipalServerObjectId = principalServer.objectId;

    this.registerOutputs({
      GroupId: this.GroupId,
      ApplicationId: this.ApplicationId,
      ApplicationSecret: this.ApplicationSecret,
      ApplicationObjectId: this.ApplicationObjectId,
      PrincipalServerObjectId: this.PrincipalServerObjectId
    });
  }
}
