import z from "zod";

export const PinSchema = z.object({
    pin: z.string().regex(/^[0-9]{4}$/, "PIN must be exactly 4 digits"),
    oldPin: z
        .string()
        .regex(/^[0-9]{4}$/, "Old PIN must be exactly 4 digits")
        .optional(),
});

export type PinType = z.infer<typeof PinSchema>;
