import { useSSO } from '@clerk/expo';
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import * as AuthSession from 'expo-auth-session';
import { Link, useRouter } from 'expo-router';
import { Eye, EyeOff, MailCheck } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { AppleLogo, GoogleG } from '@/components/common/BrandIcons';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Field, Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { enableApple } from '@/lib/env';
import { useTheme } from '@/theme/ThemeProvider';
import { friendlyAuthError, incompleteMessage } from './clerkErrors';
import { needsEmailCode, PASSWORD_MIN_LENGTH } from './rules';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Errors = { name?: string; email?: string; password?: string; code?: string; form?: string };

/** Port of Trippy's AuthForm. Clerk replaces Supabase; the email-confirmation *link* becomes a 6-digit code. */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const router = useRouter();
  const { resolved } = useTheme();
  const { signIn, setActive: activateSignIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: activateSignUp, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [social, setSocial] = useState<'google' | 'apple' | null>(null);
  const [step, setStep] = useState<'form' | 'verify'>('form');

  // Pre-start Android's browser (Custom Tabs) so the Google sign-in tab opens fast and returns cleanly.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync().catch(() => undefined);
    return () => void WebBrowser.coolDownAsync().catch(() => undefined);
  }, []);
  // Which flow the emailed code belongs to: confirming a new account, or Clerk's new-device check at sign-in.
  const [verifyFor, setVerifyFor] = useState<'signup' | 'signin'>('signup');

  const ready = signup ? signUpLoaded : signInLoaded;

  function validate() {
    const next: Errors = {};
    if (signup && !name.trim()) next.name = 'Tell us what to call you.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (signup ? password.length < PASSWORD_MIN_LENGTH : password.length === 0) {
      next.password = signup ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : 'Enter your password.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const done = () => router.replace('/');

  async function onSubmit() {
    if (!ready || !validate()) return;
    setLoading(true);
    setErrors({});
    try {
      if (signup) {
        const [first, ...rest] = name.trim().split(/\s+/);
        await signUp!.create({ emailAddress: email.trim(), password, firstName: first, lastName: rest.join(' ') || undefined });
        await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
        setVerifyFor('signup');
        setStep('verify');
      } else {
        const res = await signIn!.create({ identifier: email.trim(), password });
        if (res.status === 'complete' && res.createdSessionId) {
          await activateSignIn!({ session: res.createdSessionId });
          done();
        } else if (needsEmailCode(res.status)) {
          // Clerk's Device Trust: a new device must confirm with an emailed code before it gets a session.
          await signIn!.prepareSecondFactor({ strategy: 'email_code' });
          setVerifyFor('signin');
          setStep('verify');
        } else {
          setErrors({ form: incompleteMessage(res) });
        }
      }
    } catch (err) {
      setErrors({ form: friendlyAuthError(err) });
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    if (!(verifyFor === 'signin' ? signInLoaded : signUpLoaded) || code.trim().length < 6) {
      setErrors({ code: 'Enter the 6-digit code from your email.' });
      return;
    }
    setLoading(true);
    setErrors({});
    try {
      if (verifyFor === 'signin') {
        const res = await signIn!.attemptSecondFactor({ strategy: 'email_code', code: code.trim() });
        if (res.status === 'complete' && res.createdSessionId) {
          await activateSignIn!({ session: res.createdSessionId });
          done();
        } else {
          setErrors({ form: incompleteMessage(res) });
        }
        return;
      }
      const res = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete' && res.createdSessionId) {
        await activateSignUp!({ session: res.createdSessionId });
        done();
      } else {
        setErrors({ form: incompleteMessage(res) });
      }
    } catch (err) {
      setErrors({ code: friendlyAuthError(err) });
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      if (verifyFor === 'signin') await signIn?.prepareSecondFactor({ strategy: 'email_code' });
      else await signUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
      setErrors({ code: undefined, form: undefined });
    } catch (err) {
      setErrors({ form: friendlyAuthError(err) });
    }
  }

  /**
   * Browser-based OAuth (works on Android, where there is no native Apple sheet; Clerk's development instance
   * ships shared Google credentials, so no Google Cloud setup is needed for testing).
   */
  async function withProvider(provider: 'google' | 'apple') {
    setSocial(provider);
    setErrors({});
    try {
      // A dedicated path (see app/(auth)/sso-callback.tsx): `trippzy://sso-callback` in a build,
      // `exp://<ip>:8081/--/sso-callback` in Expo Go.
      const redirectUrl = AuthSession.makeRedirectUri({ path: 'sso-callback' });
      if (__DEV__) console.log('[auth] browser sign-in redirect URL:', redirectUrl);
      const { createdSessionId, setActive, signUp: su, signIn: si } = await startSSOFlow({
        strategy: provider === 'google' ? 'oauth_google' : 'oauth_apple',
        redirectUrl,
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        done();
      } else if (su || si) {
        // Clerk accepted the provider but didn't create a session (e.g. the instance requires a phone number).
        // Cancelling in the browser returns neither, so that case stays silent.
        setErrors({ form: incompleteMessage(su?.missingFields?.length ? su : (si ?? su)) });
      }
    } catch (err) {
      const msg = friendlyAuthError(err);
      if (msg) setErrors({ form: msg });
    } finally {
      setSocial(null);
    }
  }
  const withGoogle = () => withProvider('google');
  const withApple = () => withProvider('apple');

  if (step === 'verify') {
    return (
      <View>
        <View className="mb-5 size-14 items-center justify-center self-center rounded-2xl bg-surface-2">
          <Icon as={MailCheck} size={24} className="text-ink" />
        </View>
        <Text className="text-center font-geist-semibold text-2xl tracking-tight">Check your inbox</Text>
        <Text className="mt-2 text-center text-[15px] leading-[22px] text-muted">
          We sent a 6-digit code to <Text className="font-geist-medium">{email}</Text>.{' '}
          {verifyFor === 'signin' ? 'Enter it to confirm it’s you on this new device.' : 'Enter it to finish creating your account.'}
        </Text>
        <Field label="Verification code" error={errors.code} className="mt-6">
          <Input
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder="123456"
            invalid={!!errors.code}
            className="text-center font-geist-mono tracking-[6px]"
            accessibilityLabel="Verification code"
          />
        </Field>
        {errors.form ? <FormError message={errors.form} /> : null}
        <Button size="lg" className="mt-5 w-full" loading={loading} onPress={onVerify}>
          {verifyFor === 'signin' ? 'Confirm and sign in' : 'Verify and continue'}
        </Button>
        <View className="mt-4 flex-row justify-center gap-6">
          <Pressable onPress={resend} accessibilityRole="button">
            <Text className="font-geist-medium text-sm text-muted">Resend code</Text>
          </Pressable>
          <Pressable onPress={() => setStep('form')} accessibilityRole="button">
            <Text className="font-geist-medium text-sm text-muted">Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text className="font-geist-semibold text-[28px] leading-[32px]" style={{ letterSpacing: -0.84 }}>
        {signup ? 'Create your account' : 'Welcome back'}
      </Text>
      <Text className="mt-1.5 text-[15px] text-muted">{signup ? 'Start organising your journeys in seconds.' : 'Sign in to see your trips.'}</Text>

      <View className="mt-7 gap-4">
        {signup ? (
          <Field label="Name" error={errors.name}>
            <Input value={name} onChangeText={setName} placeholder="Alex Morgan" autoComplete="name" textContentType="name" invalid={!!errors.name} accessibilityLabel="Name" />
          </Field>
        ) : null}

        <Field label="Email" error={errors.email}>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            invalid={!!errors.email}
            accessibilityLabel="Email"
          />
        </Field>

        <Field label="Password" error={errors.password} hint={signup ? `At least ${PASSWORD_MIN_LENGTH} characters.` : undefined}>
          <View>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete={signup ? 'new-password' : 'current-password'}
              textContentType={signup ? 'newPassword' : 'password'}
              invalid={!!errors.password}
              className="pr-12"
              accessibilityLabel="Password"
              onSubmitEditing={onSubmit}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1.5 size-9 items-center justify-center rounded-full active:bg-surface-2"
            >
              <Icon as={showPassword ? EyeOff : Eye} size={18} className="text-muted" />
            </Pressable>
          </View>
        </Field>

        {errors.form ? <FormError message={errors.form} /> : null}

        <Button size="lg" className="mt-2 w-full" loading={loading} disabled={!ready} onPress={onSubmit}>
          Continue
        </Button>
      </View>

      <View className="my-5 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-line" />
        <Text className="text-xs text-faint">or</Text>
        <View className="h-px flex-1 bg-line" />
      </View>

      <View className="gap-2.5">
        <Button variant="secondary" size="lg" className="w-full" loading={social === 'google'} disabled={!!social} leading={<GoogleG />} onPress={withGoogle}>
          Continue with Google
        </Button>
        {enableApple ? (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            loading={social === 'apple'}
            disabled={!!social}
            leading={<AppleLogo color={resolved === 'dark' ? '#f4f4f1' : '#111110'} />}
            onPress={withApple}
          >
            Continue with Apple
          </Button>
        ) : null}
      </View>

      <View className="mt-6 flex-row justify-center">
        <Text className="text-sm text-muted">{signup ? 'Already have an account? ' : 'New here? '}</Text>
        <Link href={signup ? '/login' : '/signup'} replace>
          <Text className="font-geist-semibold text-sm underline">{signup ? 'Sign in' : 'Create an account'}</Text>
        </Link>
      </View>
    </View>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" className="rounded-2xl bg-danger-bg px-4 py-3">
      <Text className="text-sm text-danger">{message}</Text>
    </View>
  );
}
