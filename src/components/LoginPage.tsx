import React, { useEffect, useRef, useState } from 'react';
import { Shield, Lock, User, ArrowRight, Smartphone, Globe, Coins, Mail, UserCheck, Landmark, PiggyBank, CalendarClock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LANGUAGES, getTranslation, LanguageCode } from '../lib/translations';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface LoginPageProps {
  onLogin: (userProfile: any, token: string, keepSignedIn: boolean) => void;
  lang: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
}

export const COUNTRY_CURRENCY_LIST = [
  { country: "United States of America", currency: "USD", symbol: "$" },
  { country: "United Kingdom", currency: "GBP", symbol: "£" },
  { country: "Canada", currency: "CAD", symbol: "$" },
  { country: "United Arab Emirates", currency: "AED", symbol: "د.إ" },
  { country: "European Union Countries", currency: "EUR", symbol: "€" },
  { country: "Australia", currency: "AUD", symbol: "$" },
  { country: "Nigeria", currency: "NGN", symbol: "₦" },
  { country: "Albania", currency: "ALL", symbol: "Lek" },
  { country: "Afghanistan", currency: "AFN", symbol: "؋" },
  { country: "Argentina", currency: "ARS", symbol: "$" },
  { country: "Aruba", currency: "AWG", symbol: "ƒ" },
  { country: "Azerbaijan", currency: "AZN", symbol: "ман" },
  { country: "Bahamas", currency: "BSD", symbol: "$" },
  { country: "Barbados", currency: "BBD", symbol: "$" },
  { country: "Belarus", currency: "BYR", symbol: "p." },
  { country: "Belize", currency: "BZD", symbol: "BZ$" },
  { country: "Bermuda", currency: "BMD", symbol: "$" },
  { country: "Bolivia", currency: "BOB", symbol: "$b" },
  { country: "Bosnia and Herzegovina", currency: "BAM", symbol: "KM" },
  { country: "Botswana", currency: "BWP", symbol: "P" },
  { country: "Bulgaria", currency: "BGN", symbol: "лв" },
  { country: "Brazil", currency: "BRL", symbol: "R$" },
  { country: "Brunei", currency: "BND", symbol: "$" },
  { country: "Cambodia", currency: "KHR", symbol: "៛" },
  { country: "Cayman Islands", currency: "KYD", symbol: "$" },
  { country: "Chile", currency: "CLP", symbol: "$" },
  { country: "China", currency: "CNY", symbol: "¥" },
  { country: "Colombia", currency: "COP", symbol: "$" },
  { country: "Costa Rica", currency: "CRC", symbol: "₡" },
  { country: "Croatia", currency: "HRK", symbol: "kn" },
  { country: "Cuba", currency: "CUP", symbol: "₱" },
  { country: "Czech Republic", currency: "CZK", symbol: "Kč" },
  { country: "Denmark", currency: "DKK", symbol: "kr" },
  { country: "Dominican Republic", currency: "DOP", symbol: "RD$" },
  { country: "East Caribbean", currency: "XCD", symbol: "$" },
  { country: "Egypt", currency: "EGP", symbol: "£" },
  { country: "El Salvador", currency: "SVC", symbol: "$" },
  { country: "Falkland Islands", currency: "FKP", symbol: "£" },
  { country: "Fiji", currency: "FJD", symbol: "$" },
  { country: "Ghana", currency: "GHC", symbol: "¢" },
  { country: "Gibraltar", currency: "GIP", symbol: "£" },
  { country: "Guatemala", currency: "GTQ", symbol: "Q" },
  { country: "Guernsey", currency: "GGP", symbol: "£" },
  { country: "Guyana", currency: "GYD", symbol: "$" },
  { country: "Honduras", currency: "HNL", symbol: "L" },
  { country: "Hong Kong", currency: "HKD", symbol: "$" },
  { country: "Hungary", currency: "HUF", symbol: "Ft" },
  { country: "Iceland", currency: "ISK", symbol: "kr" },
  { country: "India", currency: "INR", symbol: "₹" },
  { country: "Indonesia", currency: "IDR", symbol: "Rp" },
  { country: "Iran", currency: "IRR", symbol: "﷼" },
  { country: "Isle of Man", currency: "IMP", symbol: "£" },
  { country: "Israel", currency: "ILS", symbol: "₪" },
  { country: "Jamaica", currency: "JMD", symbol: "J$" },
  { country: "Japan", currency: "JPY", symbol: "¥" },
  { country: "Jersey", currency: "JEP", symbol: "£" },
  { country: "Kazakhstan", currency: "KZT", symbol: "лв" },
  { country: "North Korea", currency: "KPW", symbol: "₩" },
  { country: "South Korea", currency: "KRW", symbol: "₩" },
  { country: "Kyrgyzstan", currency: "KGS", symbol: "лв" },
  { country: "Laos", currency: "LAK", symbol: "₭" },
  { country: "Latvia", currency: "LVL", symbol: "Ls" },
  { country: "Lebanon", currency: "LBP", symbol: "£" },
  { country: "Liberia", currency: "LRD", symbol: "$" },
  { country: "Switzerland", currency: "CHF", symbol: "CHF" },
  { country: "Lithuania", currency: "LTL", symbol: "Lt" },
  { country: "Macedonia", currency: "MKD", symbol: "ден" },
  { country: "Malaysia", currency: "MYR", symbol: "RM" },
  { country: "Mauritius", currency: "MUR", symbol: "₨" },
  { country: "Mexico", currency: "MXN", symbol: "$" },
  { country: "Mongolia", currency: "MNT", symbol: "₮" },
  { country: "Mozambique", currency: "MZN", symbol: "MT" },
  { country: "Namibia", currency: "NAD", symbol: "$" },
  { country: "Nepal", currency: "NPR", symbol: "₨" },
  { country: "Netherlands Antilles", currency: "ANG", symbol: "ƒ" },
  { country: "New Zealand", currency: "NZD", symbol: "$" },
  { country: "Nicaragua", currency: "NIO", symbol: "C$" },
  { country: "Norway", currency: "NOK", symbol: "kr" },
  { country: "Oman", currency: "OMR", symbol: "﷼" },
  { country: "Pakistan", currency: "PKR", symbol: "₨" },
  { country: "Panama", currency: "PAB", symbol: "B/." },
  { country: "Paraguay", currency: "PYG", symbol: "Gs" },
  { country: "Peru", currency: "PEN", symbol: "S/." },
  { country: "Philippines", currency: "PHP", symbol: "Php" },
  { country: "Poland", currency: "PLN", symbol: "zł" },
  { country: "Qatar", currency: "QAR", symbol: "﷼" },
  { country: "Romania", currency: "RON", symbol: "lei" },
  { country: "Russia", currency: "RUB", symbol: "руб" },
  { country: "Saint Helena", currency: "SHP", symbol: "£" },
  { country: "Saudi Arabia", currency: "SAR", symbol: "﷼" },
  { country: "Serbia", currency: "RSD", symbol: "Дин." },
  { country: "Seychelles", currency: "SCR", symbol: "₨" },
  { country: "Singapore", currency: "SGD", symbol: "$" },
  { country: "Solomon Islands", currency: "SBD", symbol: "$" },
  { country: "Somalia", currency: "SOS", symbol: "S" },
  { country: "South Africa", currency: "ZAR", symbol: "R" },
  { country: "Sri Lanka", currency: "LKR", symbol: "₨" },
  { country: "Sweden", currency: "SEK", symbol: "kr" },
  { country: "Suriname", currency: "SRD", symbol: "$" },
  { country: "Syria", currency: "SYP", symbol: "£" },
  { country: "Taiwan", currency: "TWD", symbol: "NT$" },
  { country: "Thailand", currency: "THB", symbol: "฿" },
  { country: "Trinidad and Tobago", currency: "TTD", symbol: "TT$" },
  { country: "Turkey", currency: "TRY", symbol: "₺" },
  { country: "Tuvalu", currency: "TVD", symbol: "$" },
  { country: "Ukraine", currency: "UAH", symbol: "₴" },
  { country: "Uruguay", currency: "UYU", symbol: "$U" },
  { country: "Uzbekistan", currency: "UZS", symbol: "лв" },
  { country: "Venezuela", currency: "VEF", symbol: "Bs" },
  { country: "Vietnam", currency: "VND", symbol: "₫" },
  { country: "Yemen", currency: "YER", symbol: "﷼" },
  { country: "Zimbabwe", currency: "ZWD", symbol: "Z$" },
  { country: "Algeria", currency: "DZD", symbol: "DA" },
  { country: "Angola", currency: "AOA", symbol: "Kz" },
  { country: "Armenia", currency: "AMD", symbol: "֏" },
  { country: "Bahrain", currency: "BHD", symbol: "BD" },
  { country: "Bangladesh", currency: "BDT", symbol: "৳" },
  { country: "West African CFA countries", currency: "XOF", symbol: "CFA" },
  { country: "Burundi", currency: "BIF", symbol: "FBu" },
  { country: "Central African CFA countries", currency: "XAF", symbol: "FCFA" },
  { country: "Cape Verde", currency: "CVE", symbol: "Esc" },
  { country: "Comoros", currency: "KMF", symbol: "CF" },
  { country: "Djibouti", currency: "DJF", symbol: "Fdj" },
  { country: "Eritrea", currency: "ERN", symbol: "Nkf" },
  { country: "Ethiopia", currency: "ETB", symbol: "Br" },
  { country: "CFP Franc countries", currency: "XPF", symbol: "₣" },
  { country: "Gambia", currency: "GMD", symbol: "D" },
  { country: "Georgia", currency: "GEL", symbol: "ლ" },
  { country: "Ghana", currency: "GHS", symbol: "GH₵" },
  { country: "Guinea", currency: "GNF", symbol: "FG" },
  { country: "Iraq", currency: "IQD", symbol: "ع.د" },
  { country: "Jordan", currency: "JOD", symbol: "د.ا" },
  { country: "Kenya", currency: "KES", symbol: "Ksh" },
  { country: "Kuwait", currency: "KWD", symbol: "د.ك" },
  { country: "Libya", currency: "LYD", symbol: "ل.د" },
  { country: "Macau", currency: "MOP", symbol: "MOP$" },
  { country: "Madagascar", currency: "MGA", symbol: "Ar" },
  { country: "Malawi", currency: "MWK", symbol: "MK" },
  { country: "Maldives", currency: "MVR", symbol: "Rf" },
  { country: "Mauritania", currency: "MRO", symbol: "UM" },
  { country: "Moldova", currency: "MDL", symbol: "L" },
  { country: "Morocco", currency: "MAD", symbol: "MAD" },
  { country: "Myanmar", currency: "MMK", symbol: "K" },
  { country: "Papua New Guinea", currency: "PGK", symbol: "K" },
  { country: "Rwanda", currency: "RWF", symbol: "R₣" },
  { country: "Samoa", currency: "WST", symbol: "WS$" },
  { country: "Sao Tome", currency: "STD", symbol: "Db" },
  { country: "Sierra Leone", currency: "SLL", symbol: "Le" },
  { country: "South Sudan", currency: "SSP", symbol: "£" },
  { country: "Sudan", currency: "SDG", symbol: "ج.س" },
  { country: "Swaziland", currency: "SZL", symbol: "L" },
  { country: "Tajikistan", currency: "TJS", symbol: "ЅM" },
  { country: "Tanzania", currency: "TZS", symbol: "TSh" },
  { country: "Tonga", currency: "TOP", symbol: "T$" },
  { country: "Tunisia", currency: "TND", symbol: "DT" },
  { country: "Turkmenistan", currency: "TMT", symbol: "T" },
  { country: "Uganda", currency: "UGX", symbol: "USh" },
  { country: "Vanuatu", currency: "VUV", symbol: "VT" },
  { country: "Zambia", currency: "ZMW", symbol: "ZK" }
];

export default function LoginPage({ onLogin, lang, onLanguageChange }: LoginPageProps) {
  const [view, setView] = useState<'login' | 'register' | 'register-email' | 'register-code' | 'forgot'>('login');
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState(1);
  const [pendingLoginUser, setPendingLoginUser] = useState<any>(null);
  const [pendingToken, setPendingToken] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loginCodeConfirmation, setLoginCodeConfirmation] = useState('');
  const [loginCodeSetupRequired, setLoginCodeSetupRequired] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [maskedLoginEmail, setMaskedLoginEmail] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const [developmentCode, setDevelopmentCode] = useState('');

  // Registration State
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCountry, setRegCountry] = useState('United States of America');
  const [regCurrency, setRegCurrency] = useState('USD');
  const [regDob, setRegDob] = useState('');
  const [regAccountType, setRegAccountType] = useState('');
  const [regLoginCode, setRegLoginCode] = useState('');
  const [regLoginCodeConfirmation, setRegLoginCodeConfirmation] = useState('');
  const [registrationEnrollmentToken, setRegistrationEnrollmentToken] = useState('');
  const [registrationEmailChallengeToken, setRegistrationEmailChallengeToken] = useState('');
  const [registrationEmailCode, setRegistrationEmailCode] = useState('');
  const [registrationMaskedEmail, setRegistrationMaskedEmail] = useState('');
  const loginCodeInputRef = useRef<HTMLInputElement>(null);
  const emailCodeInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const t = (key: string, fb: string = "") => getTranslation(lang, key, fb);
  const activeDirection = LANGUAGES.find(l => l.code === lang)?.direction || 'ltr';

  useEffect(() => {
    if (view !== 'login') return;
    const input = step === 3 ? loginCodeInputRef.current : step === 4 ? emailCodeInputRef.current : null;
    if (!input) return;
    const focusInput = () => {
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    };
    const frame = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(frame);
  }, [step, view]);

  const handleLoginNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (step === 1) {
      if (!email) {
        setError(t('emailAddress', 'Please enter your email address.'));
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!password) {
        setError(t('password', 'Please enter your secure password.'));
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        setIsLoading(false);

        if (!response.ok) {
          setError(data.error?.message || data.error || 'Invalid credentials or login failure.');
          return;
        }

        const result = data?.data || data;
        setPreAuthToken(result.challenge_token);
        setLoginCodeSetupRequired(Boolean(result.requires_login_code_setup));
        setLoginCode('');
        setLoginCodeConfirmation('');
        setStep(3);
      } catch (err: any) {
        setIsLoading(false);
        setError('Server authentication connection error.');
      }
    }
  };

  const verifyConfirmPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
        body: JSON.stringify({ new_password: newPassword, force_change_completion: true })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Could not change password');
      setPendingLoginUser((user: any) => ({ ...user, force_password_change: 0 }));
      onLogin({ ...pendingLoginUser, force_password_change: 0 }, pendingToken, keepSignedIn);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyLoginCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4}$/.test(loginCode)) return setError('Enter an exact 4-digit login code.');
    if (loginCodeSetupRequired && loginCode !== loginCodeConfirmation) return setError('Login code confirmation does not match.');
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_token: preAuthToken,
          login_code: loginCode,
          login_code_confirmation: loginCodeConfirmation,
          keep_signed_in: keepSignedIn
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Login code verification failed.');
      const result = data?.data || data;
      if (result.token && result.user) {
        if (result.user.force_password_change) {
          setPendingLoginUser(result.user);
          setPendingToken(result.token);
          setStep(5);
        } else {
          onLogin(result.user, result.token, keepSignedIn);
        }
        return;
      }
      setPreAuthToken(result.challenge_token);
      setMaskedLoginEmail(result.masked_email || email);
      setDevelopmentCode(result.development_code || '');
      setEmailCode('');
      setSuccessMsg(`A six-digit confirmation code was sent to ${result.masked_email || email}.`);
      setStep(4);
    } catch (requestError: any) {
      setError(requestError.message);
    } finally { setIsLoading(false); }
  };

  const verifyLoginEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!/^\d{6}$/.test(emailCode)) return setError('Enter the exact six-digit code sent to your email.');
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: preAuthToken, code: emailCode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Email confirmation failed.');
      const result = data?.data || data;
      if (result.user?.force_password_change) {
        setPendingLoginUser(result.user);
        setPendingToken(result.token);
        setStep(5);
      } else {
        onLogin(result.user, result.token, keepSignedIn);
      }
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resendLoginEmailCode = async () => {
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login-email-code/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: preAuthToken })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Could not send another code.');
      setDevelopmentCode(data?.data?.development_code || '');
      setSuccessMsg(`A new code was sent to ${maskedLoginEmail}.`);
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true); setError('');
    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Could not request reset');
      setResetRequested(true);
      setDevelopmentCode(data?.data?.development_code || '');
      setSuccessMsg(data?.data?.message || 'Reset code sent.');
    } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
  };

  const completeReset = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true); setError('');
    if (newPassword !== confirmPassword) { setIsLoading(false); return setError('Passwords do not match.'); }
    try {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: resetCode, new_password: newPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Could not reset password');
      setView('login'); setStep(2); setResetRequested(false); setNewPassword(''); setConfirmPassword('');
      setSuccessMsg('Password updated. You can log in immediately.');
    } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!regEmail || !regPassword || !regFirstName || !regLastName || !regUsername || !regPhone || !regAccountType) {
      setError('Please fill in all required setup details.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: regFirstName,
          last_name: regLastName,
          username: regUsername,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
          country: regCountry,
          preferred_currency: regCurrency,
          date_of_birth: regDob,
          account_type: regAccountType,
          transfer_pin: null
        })
      });

      const data = await response.json();
      setIsLoading(false);

      if (!response.ok) {
        setError(data.error?.message || data.error || 'Registration failed.');
        return;
      }

      const registeredUser = data?.data || data;
      setRegistrationEmailChallengeToken(registeredUser.registration_email_challenge_token);
      setRegistrationMaskedEmail(registeredUser.masked_email || regEmail);
      setRegistrationEmailCode('');
      setDevelopmentCode(registeredUser.development_code || '');
      setEmail(regEmail);
      setRegLoginCode('');
      setRegLoginCodeConfirmation('');
      setView('register-email');
      
      // Cleanup registration inputs
      setRegFirstName('');
      setRegLastName('');
      setRegUsername('');
      setRegEmail('');
      setRegPhone('');
      setRegPassword('');
      setRegAccountType('');
      setRegDob('');
    } catch (err: any) {
      setIsLoading(false);
      setError('Could not connect to registration services.');
    }
  };

  const completeRegistrationEmailVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!/^\d{6}$/.test(registrationEmailCode)) return setError('Enter the complete six-digit code sent to your email.');
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/registration-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_token: registrationEmailChallengeToken,
          code: registrationEmailCode
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Email confirmation failed.');
      const result = data?.data || data;
      setRegistrationEnrollmentToken(result.login_code_enrollment_token);
      setRegistrationEmailCode('');
      setRegistrationEmailChallengeToken('');
      setDevelopmentCode('');
      setSuccessMsg('Email confirmed. Create your personal login code to finish registration.');
      setView('register-code');
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resendRegistrationEmailCode = async () => {
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/registration-email-code/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: registrationEmailChallengeToken })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Could not send another code.');
      setDevelopmentCode(data?.data?.development_code || '');
      setSuccessMsg(`A new code was sent to ${registrationMaskedEmail}.`);
    } catch (requestError: any) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const completeRegistrationLoginCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessMsg('');
    if (!/^\d{4}$/.test(regLoginCode)) return setError('Create an exact 4-digit login code.');
    if (regLoginCode !== regLoginCodeConfirmation) return setError('Login code confirmation does not match.');
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: registrationEnrollmentToken, login_code: regLoginCode, login_code_confirmation: regLoginCodeConfirmation })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Could not create login code.');
      setRegLoginCode(''); setRegLoginCodeConfirmation(''); setRegistrationEnrollmentToken('');
      setPassword(''); setStep(1); setView('login');
      setSuccessMsg('Account created successfully. Your login code is ready — please sign in.');
    } catch (requestError: any) {
      setError(requestError.message);
    } finally { setIsLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative" dir={activeDirection}>
      
      {/* Floating Language Dropdown selector */}
      <div className="absolute top-6 right-6 z-30">
        <select
          value={lang}
          onChange={(e) => onLanguageChange(e.target.value as LanguageCode)}
          className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer hover:bg-slate-50 transition-all shadow-md flex items-center"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} &nbsp; {l.name}
            </option>
          ))}
        </select>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row min-h-[650px] relative"
      >
        {/* Left Side - Brand Branding Info block */}
        <div className="md:w-[40%] bg-[#003399] p-10 md:p-12 text-white flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900 to-[#003399] opacity-70" />
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-3 mb-12">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <span className="text-2xl font-bold tracking-tight">{t('brand', 'Blue Crest')}</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
                {view === 'login' ? t('welcome', 'Welcome Back') : view === 'forgot' ? t('resetPasswordTitle', 'Reset Password') : view === 'register-email' ? t('confirmYourEmailTitle', 'Confirm Your Email') : view === 'register-code' ? t('secureAccountTitle', 'Secure Your Account') : t('createAccountTitle', 'Create Account')}
              </h1>
              <p className="text-blue-100/80 text-base mb-10">
                {view === 'login'
                  ? t('welcomeDesc', 'Access your premier financial portal securely.') 
                  : view === 'forgot' ? t('resetPasswordDesc', 'Recover access using a short-lived email verification code.') : view === 'register-email' ? t('confirmYourEmailDesc', 'Verify your email address before completing registration.') : view === 'register-code' ? t('secureAccountDesc', 'Finish account setup with your private four-digit login code.') : t('signUpDesc', 'Join us to manage registers dynamically across multiple browsers.')}
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
                  <Shield className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{t('securityAndCompliance', 'Security & Compliance')}</p>
                  <p className="text-blue-200/60 text-xs">{t('securityAndComplianceDesc', 'Layered account and transfer controls')}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
                  <Lock className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{t('multiFactorActive', 'Multi-Factor Active')}</p>
                  <p className="text-blue-100/60 text-xs">{t('multiFactorActiveDesc', 'Protected dynamic pin verifications')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Dynamic Forms */}
        <div className="flex-1 p-8 md:p-12 flex flex-col justify-center bg-white relative">
          <div className="w-full">
            
            <AnimatePresence mode="wait">
              {view === 'login' ? (
                <motion.div 
                  key="login-view"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-md mx-auto w-full"
                >
                  <div className="mb-8 text-center md:text-left">
                    <h2 className="text-3xl font-bold text-slate-900 mb-1">{t('signIn', 'Sign In')}</h2>
                    <p className="text-slate-500 text-sm font-medium">{t('verifyIdentityDesc', 'Verify your identity to load dynamic balances')}</p>
                  </div>

                  {/* Flow progress indicators */}
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all", step >= 1 ? "bg-[#003399] text-white" : "bg-slate-100 text-slate-400")}>1</div>
                    <div className={cn("h-px w-8 transition-colors", step >= 2 ? "bg-[#003399]" : "bg-slate-100")} />
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all", step >= 2 ? "bg-[#003399] text-white" : "bg-slate-100 text-slate-400")}>2</div>
                    <div className={cn("h-px w-8 transition-colors", step >= 3 ? "bg-[#003399]" : "bg-slate-100")} />
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all", step >= 3 ? "bg-[#003399] text-white" : "bg-slate-100 text-slate-400")}>3</div>
                    <div className={cn("h-px w-8 transition-colors", step >= 4 ? "bg-[#003399]" : "bg-slate-100")} />
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all", step >= 4 ? "bg-[#003399] text-white" : "bg-slate-100 text-slate-400")}>4</div>
                  </div>

                  {successMsg && (
                    <div className="mb-6 bg-emerald-50 text-emerald-700 text-xs font-semibold p-4 rounded-xl border border-emerald-100 text-center animate-pulse">
                      {successMsg}
                    </div>
                  )}

                  {error && (
                    <div className="mb-6 bg-rose-50 text-rose-600 text-xs font-semibold p-4 rounded-xl border border-rose-100 text-center italic">
                      {error}
                    </div>
                  )}

                  {step === 1 && (
                    <form onSubmit={handleLoginNext} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('emailAddress', 'Email Address')}</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                          <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={t('placeholderEmail', 'name@example.com')}
                            className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 text-sm font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                        <label className="flex items-center gap-3 px-1 pt-1 text-sm font-semibold text-slate-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={keepSignedIn}
                            onChange={(event) => setKeepSignedIn(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 accent-[#003399]"
                          />
                          <span>
                            {t('keepMeSignedIn', 'Keep me signed in')}
                            <span className="block text-[11px] font-medium text-slate-400">{t('keepMeSignedInHint', 'Use only on your personal device.')}</span>
                          </span>
                        </label>
                      </div>

                      <button 
                        type="submit"
                        className="w-full h-14 bg-[#003399] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 active:scale-[0.98]"
                      >
                        {t('continue', 'Continue')} <ArrowRight className="w-5 h-5" />
                      </button>
                    </form>
                  )}

                  {step === 2 && (
                    <form onSubmit={handleLoginNext} className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">{t('password', 'Security Password')}</label>
                          <span className="text-xs font-semibold text-slate-400 font-mono select-none">{email}</span>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                          <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('placeholderPassword', '••••••••')}
                            className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 text-sm font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-14 bg-[#003399] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 active:scale-[0.98] disabled:opacity-70"
                      >
                        {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('verifyAccount', 'Verify Account')} <ArrowRight className="w-5 h-5" /></>}
                      </button>
                      <button type="button" onClick={() => { setView('forgot'); setError(''); setSuccessMsg(''); }}
                        className="w-full text-xs font-bold text-[#003399] text-center">{t('forgotPassword', 'Forgot Password?')}</button>
                      <button type="button" onClick={() => setStep(1)} className="w-full text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-[#003399] text-center block">{t('orUseAnotherEmail', 'Or use another email')}</button>
                    </form>
                  )}

                  {step === 3 && (
                    <form onSubmit={verifyLoginCode} className="space-y-6">
                      <div className="text-center md:text-left">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{loginCodeSetupRequired ? t('createLoginCode', 'Create login code') : t('enterLoginCode', 'Enter login code')}</label>
                        <span className="text-slate-400 text-xs font-medium">{loginCodeSetupRequired ? t('createLoginCodeDesc', 'This is a one-time setup for your existing account. Choose four digits you can remember.') : t('enterLoginCodeDesc', 'Enter the four-digit code you created for secure dashboard access.')}</span>
                      </div>
                      <div className="relative">
                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                        <input ref={loginCodeInputRef} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" enterKeyHint="done" maxLength={4} value={loginCode} onChange={e => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={t('placeholderLoginCode', '4-digit login code')} className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 text-lg tracking-[0.5em] font-extrabold focus:bg-white focus:border-blue-200 outline-none transition-all" required autoFocus />
                      </div>
                      {loginCodeSetupRequired && <div className="relative">
                        <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                        <input type="password" inputMode="numeric" maxLength={4} value={loginCodeConfirmation} onChange={e => setLoginCodeConfirmation(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={t('placeholderConfirmLoginCode', 'Confirm login code')} className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 text-lg tracking-[0.5em] font-extrabold focus:bg-white focus:border-blue-200 outline-none transition-all" required />
                      </div>}
                      <button type="submit" disabled={isLoading || loginCode.length !== 4} className="w-full h-14 bg-[#003399] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 active:scale-[0.98] disabled:opacity-50">
                        {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{loginCodeSetupRequired ? t('continue', 'Continue') : t('continue', 'Continue')} <ArrowRight className="w-5 h-5" /></>}
                      </button>
                      <button type="button" onClick={() => { setStep(2); setError(''); setLoginCode(''); }} className="w-full text-xs font-bold text-slate-400 uppercase tracking-widest">{t('backToPassword', 'Back to password')}</button>
                    </form>
                  )}

                  {step === 4 && (
                    <form onSubmit={verifyLoginEmailCode} className="space-y-6">
                      <div className="text-center md:text-left">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{t('confirmYourEmailFlowTitle', 'Confirm your email')}</label>
                        <span className="text-slate-500 text-xs font-medium">{t('confirmYourEmailFlowDesc', 'Enter the six-digit code sent to {email}. Email confirmation is required every time you sign in.').replace('{email}', maskedLoginEmail || email)}</span>
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                        <input
                          type="text"
                          ref={emailCodeInputRef}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="one-time-code"
                          enterKeyHint="done"
                          maxLength={6}
                          value={emailCode}
                          onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder={t('placeholderEmailCode', '6-digit email code')}
                          className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 text-lg tracking-[0.4em] font-extrabold focus:bg-white focus:border-blue-200 outline-none transition-all"
                          required
                          autoFocus
                        />
                      </div>
                      {developmentCode && <p className="text-center text-xs font-semibold text-amber-700 bg-amber-50 rounded-xl p-3">Development code: {developmentCode}</p>}
                      <button type="submit" disabled={isLoading || emailCode.length !== 6} className="w-full h-14 bg-[#003399] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 active:scale-[0.98] disabled:opacity-50">
                        {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('confirmEmailAndOpenDashboard', 'Confirm Email & Open Dashboard')} <ArrowRight className="w-5 h-5" /></>}
                      </button>
                      <button type="button" disabled={isLoading} onClick={resendLoginEmailCode} className="w-full text-xs font-bold text-[#003399] disabled:opacity-50">{t('sendAnotherCode', 'Send another code')}</button>
                      <button type="button" onClick={() => { setStep(2); setError(''); setSuccessMsg(''); setEmailCode(''); }} className="w-full text-xs font-bold text-slate-400 uppercase tracking-widest">{t('restartSignIn', 'Restart sign in')}</button>
                    </form>
                  )}

                  {step === 5 && (
                    <form onSubmit={verifyConfirmPassword} className="space-y-6">
                      <div className="space-y-2">
                        <div className="text-center md:text-left">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{t('passwordChangeRequired', 'Password change required')}</label>
                          <span className="text-slate-400 text-xs font-medium">{t('passwordChangeRequiredDesc', 'Create a new password before entering your account.')}</span>
                        </div>
                        <div className="relative mt-2">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                          <input 
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder={t('placeholderNewPassword', 'New password')}
                            className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 text-sm font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                        <div className="relative mt-3">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t('placeholderConfirmNewPassword', 'Confirm new password')}
                            className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 text-sm font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-14 bg-[#003399] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 active:scale-[0.98] disabled:opacity-70"
                      >
                        {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('changePasswordAndContinue', 'Change Password & Continue')} <ArrowRight className="w-5 h-5" /></>}
                      </button>
                    </form>
                  )}

                  <div className="mt-8 text-center animate-fade-in">
                    <p className="text-slate-500 text-sm font-medium">
                      {t('noAccount', "Don't have an account?")}{' '}
                      <button 
                        onClick={() => {
                          setError('');
                          setSuccessMsg('');
                          setView('register');
                        }} 
                        className="text-[#003399] font-bold hover:underline"
                      >
                        {t('createAccount', 'Create an Account')}
                      </button>
                    </p>
                  </div>
                </motion.div>
              ) : view === 'forgot' ? (
                <motion.div key="forgot-view" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} className="max-w-md mx-auto w-full">
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">{t('forgotPassword', 'Forgot Password?')}</h2>
                  <p className="text-sm text-slate-500 mb-6">{t('resetPasswordDesc', 'Recover access using a short-lived email verification code.')}</p>
                  {successMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">{successMsg}{developmentCode && <span className="block mt-1">Development code: {developmentCode}</span>}</div>}
                  {error && <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold">{error}</div>}
                  {!resetRequested ? <form onSubmit={requestReset} className="space-y-4"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="field-control" placeholder={t('placeholderRegisteredEmail', 'Registered email')} required /><button disabled={isLoading} className="w-full py-4 rounded-xl bg-[#003399] text-white font-bold text-sm">{isLoading ? 'Sending…' : t('sendResetCode', 'Send Reset Code')}</button></form>
                  : <form onSubmit={completeReset} className="space-y-4"><input value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))} className="field-control" placeholder={t('resetCodePlaceholder', '6-digit reset code')} required /><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="field-control" placeholder={t('placeholderNewPassword', 'New password')} required /><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="field-control" placeholder={t('placeholderConfirmNewPassword', 'Confirm new password')} required /><button disabled={isLoading} className="w-full py-4 rounded-xl bg-[#003399] text-white font-bold text-sm">{isLoading ? 'Updating…' : t('resetPasswordButton', 'Reset Password')}</button></form>}
                  <button onClick={() => { setView('login'); setResetRequested(false); setError(''); }} className="w-full mt-5 text-xs font-bold text-slate-400">{t('backToSignIn', 'Back to sign in')}</button>
                </motion.div>
              ) : view === 'register-email' ? (
                <motion.div key="register-email-view" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} className="max-w-md mx-auto w-full">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#003399] flex items-center justify-center mx-auto md:mx-0 mb-5"><Mail className="w-8 h-8"/></div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">{t('verifyEmailTitle', 'Verify Your Email')}</h2>
                  <p className="text-sm text-slate-500 mb-6">{t('verifyEmailDesc', 'We sent a six-digit confirmation code to {email}. Confirm it before your Blue Crest registration can be completed.').replace('{email}', registrationMaskedEmail || email)}</p>
                  {successMsg && <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">{successMsg}</div>}
                  {error && <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold">{error}</div>}
                  {developmentCode && <div className="mb-4 p-3 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold text-center">Development code: {developmentCode}</div>}
                  <form onSubmit={completeRegistrationEmailVerification} className="space-y-4">
                    <div>
                      <label className="form-label">{t('emailConfirmationCode', 'Email confirmation code')}</label>
                      <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={registrationEmailCode} onChange={(event) => setRegistrationEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="field-control text-center tracking-[0.4em] text-lg" placeholder="6-digit code" required autoFocus />
                    </div>
                    <button disabled={isLoading || registrationEmailCode.length !== 6} className="w-full h-14 rounded-xl bg-[#003399] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                      {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <>{t('confirmEmailButton', 'Confirm Email')} <ArrowRight className="w-5 h-5"/></>}
                    </button>
                  </form>
                  <button type="button" onClick={resendRegistrationEmailCode} disabled={isLoading} className="w-full mt-5 text-xs font-bold text-[#003399] disabled:opacity-50">{t('sendAnotherCode', 'Send another code')}</button>
                  <p className="mt-4 text-center text-[11px] font-medium text-slate-400">{t('checkSpamHint', 'Check your Spam or Junk folder if the message does not appear in your inbox.')}</p>
                </motion.div>
              ) : view === 'register-code' ? (
                <motion.div key="register-code-view" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} className="max-w-md mx-auto w-full">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto md:mx-0 mb-5"><UserCheck className="w-8 h-8"/></div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">{t('accountCreatedTitle', 'Account Created')}</h2>
                  <p className="text-sm text-slate-500 mb-2">{t('accountCreatedDesc', 'Your banking account has been created successfully.')}</p>
                  <p className="text-sm text-slate-500 mb-6">{t('accountCreatedSubtitle', 'Now create the four-digit login code you’ll use after your password whenever you sign in.')}</p>
                  {error && <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold">{error}</div>}
                  <form onSubmit={completeRegistrationLoginCode} className="space-y-4">
                    <div><label className="form-label">{t('createFourDigitLoginCode', 'Create 4-digit login code')}</label><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={regLoginCode} onChange={e => setRegLoginCode(e.target.value.replace(/\D/g, '').slice(0, 4))} className="field-control text-center tracking-[0.5em] text-lg" required autoFocus /></div>
                    <div><label className="form-label">{t('confirmLoginCode', 'Confirm login code')}</label><input type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={regLoginCodeConfirmation} onChange={e => setRegLoginCodeConfirmation(e.target.value.replace(/\D/g, '').slice(0, 4))} className="field-control text-center tracking-[0.5em] text-lg" required /></div>
                    <button disabled={isLoading || regLoginCode.length !== 4 || regLoginCodeConfirmation.length !== 4} className="w-full h-14 rounded-xl bg-[#003399] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">{isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <>{t('createLoginCodeButton', 'Create Login Code')} <ArrowRight className="w-5 h-5"/></>}</button>
                  </form>
                  <button type="button" onClick={() => { setView('login'); setStep(1); setError(''); setSuccessMsg('Finish setting up your login code after signing in.'); }} className="w-full mt-5 text-xs font-bold text-slate-400">{t('finishLaterAndSignIn', 'Finish later and sign in')}</button>
                </motion.div>
              ) : (
                <motion.div 
                  key="register-view"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-xl mx-auto w-full"
                >
                  <div className="mb-6 text-center md:text-left">
                    <h2 className="text-3xl font-bold text-slate-900 mb-1">{t('createAccountTitle', 'Create Account')}</h2>
                    <p className="text-slate-500 text-sm font-medium">{t('signUpDesc', 'Join us to manage registers dynamically across multiple browsers')}</p>
                  </div>

                  {error && (
                    <div className="mb-4 bg-rose-50 text-rose-600 text-xs font-semibold p-4 rounded-xl border border-rose-100 text-center">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleRegisterSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* First Name */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('firstName', 'First Name')}</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input 
                            type="text" 
                            value={regFirstName}
                            onChange={(e) => setRegFirstName(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      {/* Last Name */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('lastName', 'Last Name')}</label>
                        <div className="relative">
                          <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input 
                            type="text" 
                            value={regLastName}
                            onChange={(e) => setRegLastName(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      {/* Username */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('username', 'Username')}</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input 
                            type="text" 
                            value={regUsername}
                            onChange={(e) => setRegUsername(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      {/* Email */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('emailAddress', 'Email Address')}</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input 
                            type="email" 
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      {/* Phone */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('phoneNumber', 'Phone Number')}</label>
                        <div className="relative">
                          <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input 
                            type="tel" 
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      {/* Password */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('password', 'Security Password')}</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input 
                            type="password" 
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all"
                            required
                          />
                        </div>
                      </div>

                      {/* Date of Birth */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('dateOfBirth', 'Date of Birth')}</label>
                        <div className="relative">
                          <input 
                            type="date" 
                            value={regDob}
                            onChange={(e) => setRegDob(e.target.value)}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all text-slate-800"
                            required
                          />
                        </div>
                      </div>

                      {/* Country */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('country', 'Country')}</label>
                        <div className="relative">
                          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <select 
                            value={regCountry}
                            onChange={(e) => {
                              const selected = e.target.value;
                              setRegCountry(selected);
                              const found = COUNTRY_CURRENCY_LIST.find(c => c.country === selected);
                              if (found) {
                                setRegCurrency(found.currency);
                              }
                            }}
                            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 text-xs font-semibold focus:bg-white focus:border-blue-200 outline-none transition-all appearance-none cursor-pointer"
                          >
                            {COUNTRY_CURRENCY_LIST.map(c => (
                              <option key={c.country} value={c.country}>{c.country}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                    </div>

                    <fieldset className="space-y-2">
                      <legend className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">{t('chooseAccountType', 'Choose your account type')} <span className="text-rose-500">*</span></legend>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { value: 'CHECKING', label: t('checkingAccountLabel', 'Checking'), detail: t('checkingAccountDetail', 'Everyday banking'), icon: Landmark },
                          { value: 'SAVINGS', label: t('savingsAccountLabel', 'Savings'), detail: t('savingsAccountDetail', 'Build your savings'), icon: PiggyBank },
                          { value: 'FIXED_DEPOSIT', label: t('fixedDepositLabel', 'Fixed Deposit'), detail: t('fixedDepositDetail', 'Save for a set term'), icon: CalendarClock }
                        ].map(option => <label key={option.value} className={`cursor-pointer rounded-2xl border p-3 transition-all ${regAccountType === option.value ? 'border-[#003399] bg-blue-50 ring-2 ring-blue-100' : 'border-slate-100 bg-slate-50 hover:border-blue-200'}`}>
                          <input type="radio" name="account_type" value={option.value} checked={regAccountType === option.value} onChange={e => setRegAccountType(e.target.value)} className="sr-only" required />
                          <option.icon className={`w-5 h-5 mb-2 ${regAccountType === option.value ? 'text-[#003399]' : 'text-slate-400'}`}/>
                          <span className="block text-xs font-extrabold text-slate-800">{option.label}</span>
                          <span className="block text-[9px] text-slate-400 mt-0.5">{option.detail}</span>
                        </label>)}
                      </div>
                    </fieldset>

                    <button 
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-14 mt-4 bg-[#003399] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/10 active:scale-[0.98] disabled:opacity-70"
                    >
                      {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('createAccountTitle', 'Create Account')} <ArrowRight className="w-5 h-5" /></>}
                    </button>
                  </form>

                  <div className="mt-6 text-center animate-fade-in">
                    <p className="text-slate-500 text-sm font-medium">
                      {t('hasAccount', 'Already have an account?')}{' '}
                      <button 
                        onClick={() => {
                          setError('');
                          setSuccessMsg('');
                          setView('login');
                          setStep(1);
                        }} 
                        className="text-[#003399] font-bold hover:underline"
                      >
                        {t('signInInstead', 'Sign In Instead')}
                      </button>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-10 pt-6 border-t border-slate-100 text-center">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                {t('supportLine', 'Support')}: <span className="text-[#003399]">0800 BLUE CREST</span>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
