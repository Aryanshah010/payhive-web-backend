import z from "zod";

const PaymentTypeSchema = z.enum(["TRANSFER", "BANK_TRANSFER"]).optional();

const PhoneNumberSchema = z
    .string()
    .regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits (0-9)");

const BankNameSchema = z.string().trim().min(2, "bankName is required");

const AccountNumberSchema = z
    .string()
    .trim()
    .regex(/^[0-9]{8,20}$/, "accountNumber must be 8 to 20 digits");

export const TransactionBaseSchema = z
    .object({
        paymentType: PaymentTypeSchema,
        toPhoneNumber: PhoneNumberSchema.optional(),
        bankName: BankNameSchema.optional(),
        accountNumber: AccountNumberSchema.optional(),
        amount: z
            .number()
            .positive("Amount must be greater than 0")
            .refine((val) => Number.isInteger(val * 100), "Amount must have at most 2 decimal places"),
        remark: z.string().max(140, "Remark must be at most 140 characters").optional(),
    })
    .superRefine((data, ctx) => {
        if (data.paymentType === "BANK_TRANSFER") {
            if (!data.bankName || data.bankName.trim().length < 2) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["bankName"],
                    message: "bankName is required",
                });
            }
            if (!data.accountNumber || !/^[0-9]{8,20}$/.test(data.accountNumber.trim())) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["accountNumber"],
                    message: "accountNumber must be 8 to 20 digits",
                });
            }
            return;
        }

        if (!data.toPhoneNumber || !/^[0-9]{10}$/.test(data.toPhoneNumber)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["toPhoneNumber"],
                message: "Phone number must be exactly 10 digits (0-9)",
            });
        }
    });

export const TransactionConfirmSchema = TransactionBaseSchema.safeExtend({
    pin: z.string().regex(/^[0-9]{4}$/, "PIN must be exactly 4 digits"),
    idempotencyKey: z.string().min(8, "Idempotency key too short").optional(),
});

export type TransactionBaseType = z.infer<typeof TransactionBaseSchema>;
export type TransactionConfirmType = z.infer<typeof TransactionConfirmSchema>;
