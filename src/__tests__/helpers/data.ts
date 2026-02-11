import crypto from "crypto";

const makePhoneNumber = () => {
    const pidPart = process.pid % 1000;
    const random = crypto.randomInt(0, 1_000_000);
    return `9${pidPart.toString().padStart(3, "0")}${random
        .toString()
        .padStart(6, "0")}`;
};

export const makeUser = (prefix: string, tag: string) => {
    const suffix = crypto.randomInt(100000, 999999).toString();
    return {
        fullName: `Test ${tag}`,
        phoneNumber: makePhoneNumber(),
        email: `${prefix}${tag}-${suffix}@example.com`,
        password: "Password@123",
    };
};
