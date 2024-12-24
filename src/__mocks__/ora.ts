const mockSpinner = {
  start: () => mockSpinner,
  stop: () => mockSpinner,
  succeed: () => mockSpinner,
  fail: () => mockSpinner,
};

const ora = () => mockSpinner;

export default ora;
