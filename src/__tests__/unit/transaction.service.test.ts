import { TransactionService } from "../../services/transaction.service";
import { UserRepository } from "../../repositories/user.repository";
import { MAX_TRANSFER_AMOUNT } from "../../configs";
import { HttpError } from "../../errors/http-error";

describe("TransactionService.confirmTransfer - unit", () => {
    let service: TransactionService;

    beforeEach(() => {
        service = new TransactionService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("should reject when amount exceeds MAX_TRANSFER_AMOUNT", async () => {
        const userId = "507f1f77bcf86cd799439011";

        const mockUser: any = {
            _id: userId,
            fullName: "Sender User",
            phoneNumber: "9999999999",
            pinHash: "dummy-hash",
            pinAttempts: 0,
            pinLockedUntil: null,
        };

        jest
            .spyOn(UserRepository.prototype, "getUserById")
            .mockResolvedValueOnce(mockUser);

        const amount = MAX_TRANSFER_AMOUNT + 1;

        await expect(
            service.confirmTransfer(
                userId,
                "8888888888",
                amount,
                "Test transfer",
                "1234"
            )
        ).rejects.toEqual(
            new HttpError(400, "Transfer amount exceeds maximum allowed limit")
        );
    });
});

