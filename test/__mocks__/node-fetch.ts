const fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ downloads: 1000 }),
  }),
);

export default fetch;
