import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";
import { albControllerPolicyStatement } from "./albControllerPolicy";

/// SSO Role ///
// This is currently managed outside of the stack and passed through for later stacks to use.
export const ssoRoleArn = config.ssoRoleArn;

/// Cluster Role ///
const eksRole = new aws.iam.Role(`${config.baseName}-eksRole`, {
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
export const eksServiceRoleName = eksRole.name;

/// Instance Role ///
const instanceRole = new aws.iam.Role(`${config.baseName}-instanceRole`, {
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
    role: instanceRole 
})
// ALB management used by ingress controller
const albControllerPolicy = new aws.iam.Policy("albControllerPolicy", {
    policy: albControllerPolicyStatement
});
const rpaAlbPolicy = new aws.iam.RolePolicyAttachment("albPolicy", {
    policyArn: albControllerPolicy.arn,
    role: instanceRole
})
export const eksInstanceRoleName = instanceRole.name;

const instanceProfile =  new aws.iam.InstanceProfile("ng-standard", {role: eksInstanceRoleName})
export const instanceProfileName = instanceProfile.name;

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
export const databaseMonitoringRoleArn = databaseMonitoringRole.arn;
