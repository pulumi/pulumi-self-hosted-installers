import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { config } from "./config";
import { albControllerPolicyStatement } from "./albControllerPolicy";

/// SSO Role ///
// This is currently managed outside of the stack and passed through for later stacks to use.

// These roles are either provided by the user or created in this stack.
export let eksServiceRoleName: string | pulumi.Output<string>;
export let eksServiceRole: aws.iam.Role | pulumi.Output<aws.iam.Role>;
export let eksInstanceRoleName: string | pulumi.Output<string>; 
export let eksInstanceRole: aws.iam.Role | pulumi.Output<aws.iam.Role>;
export let databaseMonitoringRoleArn: string | pulumi.Output<string>;
export let ssoRoleArn: string | undefined;


// If the user provided the roles, use them instead of creating new ones.
// It's an all-or-nothing situation, so if one is provided, they all must be.
if (config.eksServiceRoleName && config.eksInstanceRoleName && config.databaseMonitoringRoleArn) {
    eksServiceRoleName = config.eksServiceRoleName;
    eksInstanceRoleName = config.eksInstanceRoleName;
    databaseMonitoringRoleArn = config.databaseMonitoringRoleArn;
    eksServiceRole = aws.iam.Role.get("eksServiceRole", eksServiceRoleName);
    eksInstanceRole = aws.iam.Role.get("eksInstanceRole", eksInstanceRoleName);
} else {
    // Create the roles.
    /// Cluster Role ///
    eksServiceRole = new aws.iam.Role(`${config.baseName}-eksRole`, {
        assumeRolePolicy: {
            Statement: [
                {   Action:"sts:AssumeRole",
                    Effect:"Allow",
                    Principal:{
                        Service: "eks.amazonaws.com"
                    }
                }
            ],
            Version:"2012-10-17"
        },
        description: "Allows EKS to manage clusters on your behalf.",
        managedPolicyArns: [
            "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
        ],
    });
    eksServiceRoleName = eksServiceRole.name;

    /// Instance Role ///
    eksInstanceRole = new aws.iam.Role(`${config.baseName}-instanceRole`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(aws.iam.Principals.Ec2Principal),
        managedPolicyArns: [
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
            "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
        ],
    });

    // S3 policy used by Pulumi services
    const instanceRoleS3Policy = new aws.iam.RolePolicyAttachment("instanceRoleS3Policy", {
        policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
        role: eksInstanceRole 
    })

    // ALB management used by ingress controller
    const albControllerPolicy = new aws.iam.Policy("albControllerPolicy", {
        policy: albControllerPolicyStatement
    });
    const rpaAlbPolicy = new aws.iam.RolePolicyAttachment("albPolicy", {
        policyArn: albControllerPolicy.arn,
        role: eksInstanceRole
    })

    // Opensearch access
    const opensearchPolicy = new aws.iam.Policy("opensearchPolicy", {
        policy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: [
                        "es:*"
                    ],
                    Effect: "Allow",
                    Resource: "*"
                }
            ]
        }
    });
    const openSearchPolicyAttachment = new aws.iam.RolePolicyAttachment("opensearchPolicy", {
        policyArn: opensearchPolicy.arn,
        role: eksInstanceRole
    })

    eksInstanceRoleName = eksInstanceRole.name;

    // used by RDS to publish metrics to CloudWatch
    const databaseMonitoringRole = new aws.iam.Role("databaseMonitoringRole", {
        assumeRolePolicy: {
            Statement:[
                {
                    Action: "sts:AssumeRole",
                    Effect: "Allow",
                    Principal: {
                        Service: "monitoring.rds.amazonaws.com"
                    },
                    Sid: "AllowAssumeRole"
                }
            ],
            Version:"2012-10-17"
        },
        managedPolicyArns: [
            "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
        ],
    });
    databaseMonitoringRoleArn = databaseMonitoringRole.arn;
}

// Set the SSO role ARN from configuration (optional)
ssoRoleArn = config.ssoRoleArn;



