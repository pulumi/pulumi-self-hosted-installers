import * as aws from "@pulumi/aws";

// Create a simple VPC for testing
const vpc = new aws.ec2.Vpc("test-vpc", {
    cidrBlock: "10.0.0.0/16",
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags: {
        Name: "test-vpc",
    },
});

// Get availability zones
const azs = aws.getAvailabilityZones({
    state: "available",
});

// Create public subnets
const publicSubnet1 = new aws.ec2.Subnet("public-subnet-1", {
    vpcId: vpc.id,
    cidrBlock: "10.0.1.0/24",
    availabilityZone: azs.then(azs => azs.names[0]),
    mapPublicIpOnLaunch: true,
    tags: {
        Name: "public-subnet-1",
        Type: "public",
    },
});

const publicSubnet2 = new aws.ec2.Subnet("public-subnet-2", {
    vpcId: vpc.id,
    cidrBlock: "10.0.2.0/24",
    availabilityZone: azs.then(azs => azs.names[1]),
    mapPublicIpOnLaunch: true,
    tags: {
        Name: "public-subnet-2",
        Type: "public",
    },
});

// Create private subnets
const privateSubnet1 = new aws.ec2.Subnet("private-subnet-1", {
    vpcId: vpc.id,
    cidrBlock: "10.0.3.0/24",
    availabilityZone: azs.then(azs => azs.names[0]),
    tags: {
        Name: "private-subnet-1",
        Type: "private",
    },
});

const privateSubnet2 = new aws.ec2.Subnet("private-subnet-2", {
    vpcId: vpc.id,
    cidrBlock: "10.0.4.0/24",
    availabilityZone: azs.then(azs => azs.names[1]),
    tags: {
        Name: "private-subnet-2",
        Type: "private",
    },
});

// Create isolated subnets
const isolatedSubnet1 = new aws.ec2.Subnet("isolated-subnet-1", {
    vpcId: vpc.id,
    cidrBlock: "10.0.5.0/24",
    availabilityZone: azs.then(azs => azs.names[0]),
    tags: {
        Name: "isolated-subnet-1",
        Type: "isolated",
    },
});

const isolatedSubnet2 = new aws.ec2.Subnet("isolated-subnet-2", {
    vpcId: vpc.id,
    cidrBlock: "10.0.6.0/24",
    availabilityZone: azs.then(azs => azs.names[1]),
    tags: {
        Name: "isolated-subnet-2",
        Type: "isolated",
    },
});

// Create internet gateway and route table for public subnets
const igw = new aws.ec2.InternetGateway("igw", {
    vpcId: vpc.id,
    tags: {
        Name: "igw",
    },
});

const publicRouteTable = new aws.ec2.RouteTable("public-rt", {
    vpcId: vpc.id,
    routes: [{
        cidrBlock: "0.0.0.0/0",
        gatewayId: igw.id,
    }],
    tags: {
        Name: "public-rt",
    },
});

// Associate public subnets with route table
new aws.ec2.RouteTableAssociation("public-rt-assoc-1", {
    subnetId: publicSubnet1.id,
    routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation("public-rt-assoc-2", {
    subnetId: publicSubnet2.id,
    routeTableId: publicRouteTable.id,
});

// Create NAT Gateway for private subnets
const eip = new aws.ec2.Eip("nat-eip", {
    domain: "vpc",
    tags: {
        Name: "nat-eip",
    },
});

const natGateway = new aws.ec2.NatGateway("nat-gw", {
    allocationId: eip.id,
    subnetId: publicSubnet1.id,
    tags: {
        Name: "nat-gw",
    },
});

const privateRouteTable = new aws.ec2.RouteTable("private-rt", {
    vpcId: vpc.id,
    routes: [{
        cidrBlock: "0.0.0.0/0",
        natGatewayId: natGateway.id,
    }],
    tags: {
        Name: "private-rt",
    },
});

// Associate private subnets with route table
new aws.ec2.RouteTableAssociation("private-rt-assoc-1", {
    subnetId: privateSubnet1.id,
    routeTableId: privateRouteTable.id,
});

new aws.ec2.RouteTableAssociation("private-rt-assoc-2", {
    subnetId: privateSubnet2.id,
    routeTableId: privateRouteTable.id,
});

// Export the VPC and subnet IDs for the infrastructure stage
export const vpcId = vpc.id;
export const publicSubnetIds = [publicSubnet1.id, publicSubnet2.id];
export const privateSubnetIds = [privateSubnet1.id, privateSubnet2.id];
export const isolatedSubnetIds = [isolatedSubnet1.id, isolatedSubnet2.id];