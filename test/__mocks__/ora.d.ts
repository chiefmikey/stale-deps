declare const mockOra: jest.Mock<{
    start: jest.Mock<any, any, any>;
    stop: jest.Mock<any, any, any>;
    fail: jest.Mock<any, any, any>;
    succeed: jest.Mock<any, any, any>;
}, [], any>;
export default mockOra;
