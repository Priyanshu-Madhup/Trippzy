import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthForm } from '@/features/auth/AuthForm';

export default function Signup() {
  return (
    <AuthLayout>
      <AuthForm mode="signup" />
    </AuthLayout>
  );
}
