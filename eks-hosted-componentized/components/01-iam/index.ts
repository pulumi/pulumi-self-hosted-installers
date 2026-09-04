import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { albControllerPolicyStatement } from "./albControllerPolicy";

export interface IAMOutputs {
  eksServiceRoleName: pulumi.Output<string>;
  eksServiceRole: pulumi.Output<aws.iam.Role>;
  eksInstanceRoleName: pulumi.Output<string>;
  eksInstanceRole: pulumi.Output<aws.iam.Role>;
  databaseMonitoringRoleArn: pulumi.Output<string>;
}

export interface IAMArgs {}

export class IAMResources extends pulumi.ComponentResource {
  // These roles are either provided by the user or created in this stack.
  public readonly eksServiceRoleName: pulumi.Output<string>;
  public readonly eksServiceRole: pulumi.Output<aws.iam.Role>;
  public readonly eksInstanceRoleName: pulumi.Output<string>;
  public readonly eksInstanceRole: pulumi.Output<aws.iam.Role>;
  public readonly databaseMonitoringRoleArn: pulumi.Output<string>;

  constructor(
    name: string,
    args: IAMArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:IAM", name, {}, opts);

    const config = new pulumi.Config();
    // If the user provided the roles, use them instead of creating new ones.
    // It's an all-or-nothing situation, so if one is provided, they all must be.
    if (
      config.get("eksServiceRoleName") &&
      config.get("eksInstanceRoleName") &&
      config.get("databaseMonitoringRoleArn")
    ) {
      this.eksServiceRoleName = pulumi.output(
        config.require("eksServiceRoleName")
      );
      this.eksInstanceRoleName = pulumi.output(
        config.require("eksInstanceRoleName")
      );
      this.databaseMonitoringRoleArn = pulumi.output(
        config.require("databaseMonitoringRoleArn")
      );
      this.eksServiceRole = pulumi.output(aws.iam.Role.get("eksServiceRole", this.eksServiceRoleName));
      this.eksInstanceRole = pulumi.output(aws.iam.Role.get(
        "eksInstanceRole",
        this.eksInstanceRoleName
      ));
    } else {
      // Create the roles.
      /// Cluster Role ///
      const eksServiceRole = new aws.iam.Role(
        `${config.require("baseName")}-eksRole`,
        {
          assumeRolePolicy: {
            Statement: [
              {
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                  Service: "eks.amazonaws.com",
                },
              },
            ],
            Version: "2012-10-17",
          },
          description: "Allows EKS to manage clusters on your behalf.",
          managedPolicyArns: ["arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"],
        }
      );
      this.eksServiceRoleName = eksServiceRole.name;
      this.eksServiceRole = pulumi.output(eksServiceRole);

      /// Instance Role ///
      const eksInstanceRole = new aws.iam.Role(
        `${config.require("baseName")}-instanceRole`,
        {
          assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(
            aws.iam.Principals.Ec2Principal
          ),
          managedPolicyArns: [
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
            "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
          ],
        }
      );

      // S3 policy used by Pulumi services
      const instanceRoleS3Policy = new aws.iam.RolePolicyAttachment(
        "instanceRoleS3Policy",
        {
          policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
          role: eksInstanceRole,
        }
      );

      // ALB management used by ingress controller
      const albControllerPolicy = new aws.iam.Policy("albControllerPolicy", {
        policy: albControllerPolicyStatement,
      });
      const rpaAlbPolicy = new aws.iam.RolePolicyAttachment("albPolicy", {
        policyArn: albControllerPolicy.arn,
        role: eksInstanceRole,
      });

      // Opensearch access
      const opensearchPolicy = new aws.iam.Policy("opensearchPolicy", {
        policy: {
          Version: "2012-10-17",
          Statement: [
            {
              Action: ["es:*"],
              Effect: "Allow",
              Resource: "*",
            },
          ],
        },
      });
      const openSearchPolicyAttachment = new aws.iam.RolePolicyAttachment(
        "opensearchPolicy",
        {
          policyArn: opensearchPolicy.arn,
          role: eksInstanceRole,
        }
      );

      this.eksInstanceRoleName = eksInstanceRole.name;
      this.eksInstanceRole = pulumi.output(eksInstanceRole);

      // used by RDS to publish metrics to CloudWatch
      const databaseMonitoringRole = new aws.iam.Role(
        "databaseMonitoringRole",
        {
          assumeRolePolicy: {
            Statement: [
              {
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                  Service: "monitoring.rds.amazonaws.com",
                },
                Sid: "AllowAssumeRole",
              },
            ],
            Version: "2012-10-17",
          },
          managedPolicyArns: [
            "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole",
          ],
        }
      );
      this.databaseMonitoringRoleArn = databaseMonitoringRole.arn;
    }
    this.registerOutputs({
      eksServiceRoleName: this.eksServiceRoleName,
      eksServiceRole: this.eksServiceRole,
      eksInstanceRoleName: this.eksInstanceRoleName,
      eksInstanceRole: this.eksInstanceRole,
      databaseMonitoringRoleArn: this.databaseMonitoringRoleArn,
    });
  }
}
