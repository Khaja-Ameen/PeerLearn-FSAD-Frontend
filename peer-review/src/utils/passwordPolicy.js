export const PASSWORD_POLICY_TEXT =
  'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';

export const isValidPasswordByPolicy = (value) => {
  if (typeof value !== 'string') return false;
  const password = value.trim();
  if (password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:'",.<>/?`~\\]/.test(password);
  return hasUpper && hasLower && hasNumber && hasSpecial;
};
