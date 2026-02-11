import z from "zod";
import { PinSchema } from "../types/pin.type";

export const UpdatePinDto = PinSchema;
export type UpdatePinDto = z.infer<typeof UpdatePinDto>;

export const VerifyPinDto = PinSchema.pick({ pin: true });
export type VerifyPinDto = z.infer<typeof VerifyPinDto>;
