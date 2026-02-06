import request from 'supertest';
import app from '../../app';


const testUser = {
    fullName: 'John Doe',
    phoneNumber: '1234567890',
    password: 'Password@123',
}

describe('POST /api/auth/register', () => {
    test('should validate missing fields', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                fullName: testUser.fullName,
                phoneNumber: testUser.phoneNumber,
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('should register new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                fullName: testUser.fullName,
                phoneNumber: testUser.phoneNumber,
                password: testUser.password,
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe('User Created');
    });
});

describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                phoneNumber: testUser.phoneNumber,
                password: testUser.password,
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
    });

    test('should fail with invalid phone number', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                phoneNumber: '1234567891',
                password: testUser.password,
            });

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });
});
