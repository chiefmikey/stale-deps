const mockOra = jest.fn(() => ({
  start: jest.fn().mockReturnThis(),
  stop: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn(),
}));

export default mockOra;
