// Lightweight i18n: English + Kiswahili (decision #12 - Kenya's two official languages).
// Deliberately NOT using a full i18n library - a plain dictionary + context keeps this
// scoped and auditable, covering every citizen-facing screen (not just a few).
const translations = {
  en: {
    tagline: "A Trusted Platform to Report and Track Corruption",
    nav_home: "Home",
    nav_submit: "Submit Report",
    nav_track: "Track Report",
    nav_stats: "Statistics",
    nav_myReports: "My Reports",
    nav_reviewerQueue: "Reviewer Queue",
    nav_manageUsers: "Manage Users",
    nav_escalations: "Escalations",
    nav_about: "About",
    nav_privacy: "Privacy",
    signIn: "Sign In",
    signOut: "Sign out",
    signedInAs: "Signed in as",

    home_title: "Public Case List",
    home_helper:
      "General details only - this list never reveals who filed a report, even for registered reporters.",
    home_haveRef: "Have a Tracking Reference?",
    home_lookup: "Look up your case",
    home_loading: "Loading reports...",
    home_empty: "No reports found. Be the first to submit a report!",

    submit_title: "Submit a Corruption Report",
    submit_anon:
      "Reporting anonymously - no account needed. You will get a Tracking Reference and a secret Access Key at the end.",
    submit_loggedIn: "this will appear in your My Reports page.",
    label_title: "Title",
    label_category: "Category",
    label_description: "Description",
    label_county: "County",
    label_subCounty: "Sub-county",
    label_incidentDate: "When did this happen?",
    label_evidence: "Evidence (optional)",
    label_demographic: "Demographic (optional)",
    btn_submitReport: "Submit Report",
    btn_submitting: "Submitting...",

    login_title: "Welcome back",
    label_email: "Email",
    label_password: "Password",
    btn_signingIn: "Signing in...",
    noAccount: "Don't have an account?",
    register: "Register",
    forgotPassword: "Forgot password?",

    register_title: "Create an account",
    register_helper:
      "Optional - you can also report fully anonymously without an account from the Submit Report page.",
    register_rolePrompt: "What would you like to do on Kenya Watch?",
    register_roleCitizen: "I'm a citizen — I want to report corruption",
    register_roleCitizenDesc:
      "Create a private account to track your reports and get email updates. You can still report anonymously anytime.",
    register_roleReviewer: "I'm applying as a Reviewer",
    register_roleReviewerDesc:
      "Reviewer accounts require identity verification and Admin approval before they can access any reports.",
    label_fullName: "Full name",
    password_helper:
      "At least 8 characters, including a letter, a number and a special character (for example !, @, #).",
    register_notifyLegend:
      "How should we tell you when a report changes status?",
    register_notifyEmail: "Email me about status changes on my reports",
    register_notifyEmailDetail:
      "When a reviewer moves your case to In Review, Resolved or Rejected, we email",
    register_notifyOffAnytime:
      "with what changed and why. You can turn this off any time.",
    register_smsLater:
      "You can add free SMS updates later from My Reports → Notification settings.",
    register_submit: "Register",
    register_submitting: "Creating account...",
    register_failed: "Registration failed",
    register_reviewerPrompt: "Want to review reports for Kenya Watch?",
    register_applyReviewer: "Apply to become a Reviewer",
    register_requiresApproval: "(requires Admin approval)",
    register_haveAccount: "Already have an account?",

    forgot_title: "Forgot Password",
    forgot_sending: "Sending...",
    forgot_send: "Send Reset Link",
    forgot_helper:
      "Password reset links are sent by the configured email service. If you do not receive one, contact the project administrator.",
    forgot_back: "Back to sign in",

    reset_title: "Reset Password",
    label_resetToken: "Reset token",
    reset_helper:
      "Use the one-time setup or reset link sent to you. Agency account setup links expire after 24 hours.",
    label_newPassword: "New password",
    reset_updating: "Updating...",
    reset_submit: "Reset Password",
    reset_failed: "Reset failed",

    track_title: "Track a Report",
    stats_title: "Statistics",
    about_title: "About Kenya Watch",
    about_body: "Kenya Watch is a trusted platform for reporting and tracking corruption cases in Kenya. Our mission is to empower citizens, promote transparency, and help build a better society.",

    password_tooWeak:
      "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character.",
  },
  sw: {
    tagline: "Jukwaa Linaloaminika la Kuripoti na Kufuatilia Ufisadi",
    nav_home: "Nyumbani",
    nav_submit: "Wasilisha Ripoti",
    nav_track: "Fuatilia Ripoti",
    nav_stats: "Takwimu",
    nav_myReports: "Ripoti Zangu",
    nav_reviewerQueue: "Foleni ya Wakaguzi",
    nav_manageUsers: "Dhibiti Watumiaji",
    nav_escalations: "Masuala ya Dharura",
    nav_about: "Kuhusu",
    nav_privacy: "Faragha",
    signIn: "Ingia",
    signOut: "Toka",
    signedInAs: "Umeingia kama",

    home_title: "Orodha ya Kesi za Umma",
    home_helper:
      "Maelezo ya jumla tu - orodha hii haiwahi kufichua aliyewasilisha ripoti, hata kwa waripoti waliosajiliwa.",
    home_haveRef: "Una Nambari ya Kufuatilia?",
    home_lookup: "Tafuta kesi yako",
    home_loading: "Inapakia ripoti...",
    home_empty:
      "Hakuna ripoti zilizopatikana. Kuwa wa kwanza kuwasilisha ripoti!",

    submit_title: "Wasilisha Ripoti ya Ufisadi",
    submit_anon:
      "Unaripoti bila kujitambulisha - hauhitaji akaunti. Utapewa Nambari ya Kufuatilia na Nenosiri la Siri mwishoni.",
    submit_loggedIn: "hii itaonekana kwenye ukurasa wako wa Ripoti Zangu.",
    label_title: "Kichwa",
    label_category: "Aina",
    label_description: "Maelezo",
    label_county: "Kaunti",
    label_subCounty: "Kaunti Ndogo",
    label_incidentDate: "Tukio hili lilitokea lini?",
    label_evidence: "Ushahidi (si lazima)",
    label_demographic: "Takwimu Binafsi (si lazima)",
    btn_submitReport: "Wasilisha Ripoti",
    btn_submitting: "Inawasilisha...",

    login_title: "Karibu tena",
    label_email: "Barua pepe",
    label_password: "Nenosiri",
    btn_signingIn: "Inaingia...",
    noAccount: "Huna akaunti?",
    register: "Jisajili",
    forgotPassword: "Umesahau nenosiri?",

    register_title: "Fungua akaunti",
    register_helper:
      "Si lazima - unaweza pia kuripoti bila kujitambulisha kabisa kutoka ukurasa wa Wasilisha Ripoti.",
    register_rolePrompt: "Ungependa kufanya nini Kenya Watch?",
    register_roleCitizen: "Mimi ni mtumiaji wa umma - nataka kuripoti ufisadi",
    register_roleCitizenDesc:
      "Fungua akaunti ya faragha ya kufuatilia ripoti zako na kupata taarifa barua pepe. Unaweza bado kuripoti bila kujitambulisha wakati wowote.",
    register_roleReviewer: "Natuma maombi ya kuwa Mkaguzi",
    register_roleReviewerDesc:
      "Akaunti za ukaguzi zinahitaji uthibitisho wa utambulisho na idhini ya Msimamizi kabla ya kufikia ripoti yoyote.",
    label_fullName: "Jina kamili",
    password_helper:
      "Angalau herufi 8, ikijumuisha herufi, nambari na alama maalum (mfano !, @, #).",
    register_notifyLegend: "Tunawajulisha vipi ripoti inapobadilika hali?",
    register_notifyEmail: "Nitumie barua pepe ripoti zangu zinapobadilika hali",
    register_notifyEmailDetail:
      "Mkaguzi anaporipoti kesi yako kuwa Inakaguliwa, Imetatuliwa au Imekataliwa, tunatuma barua pepe",
    register_notifyOffAnytime:
      "ikiwa na mabadiliko na sababu. Unaweza kuzima wakati wowote.",
    register_smsLater:
      "Unaweza kuongeza taarifa za SMS bure baadaye kutoka Ripoti Zangu → Mipangilio ya Taarifa.",
    register_submit: "Jisajili",
    register_submitting: "Inafungua akaunti...",
    register_failed: "Usajili umeshindikana",
    register_reviewerPrompt: "Ungependa kukagua ripoti kwa Kenya Watch?",
    register_applyReviewer: "Tuma maombi ya kuwa Mkaguzi",
    register_requiresApproval: "(inahitaji idhini ya Msimamizi)",
    register_haveAccount: "Una akaunti tayari?",

    forgot_title: "Nimepoteza Nenosiri",
    forgot_sending: "Inatuma...",
    forgot_send: "Tuma Kiungo cha Kubadilisha Nenosiri",
    forgot_helper:
      "Viungo vya kubadilisha nenosiri vinatumwa kwa huduma ya barua pepe iliyosanidiwa. Ukipokea hakuna, wasiliana na msimamizi wa mradi.",
    forgot_back: "Rudi kuingia",

    reset_title: "Badilisha Nenosiri",
    label_resetToken: "Tokeni ya kubadilisha",
    reset_helper:
      "Tumia kiungo cha mara moja kilichokutumiwa. Viungo vya kuandaa akaunti za mashirika vinaisha baada ya saa 24.",
    label_newPassword: "Nenosiri jipya",
    reset_updating: "Inahifadhi...",
    reset_submit: "Badilisha Nenosiri",
    reset_failed: "Kubadilisha kumeshindikana",

    track_title: "Fuatilia Ripoti",
    stats_title: "Takwimu",
    about_title: "Kuhusu Kenya Watch",
    about_body: "Kenya Watch ni jukwaa linaloaminika la kuripoti na kufuatilia kesi za ufisadi nchini Kenya. Dhamira yetu ni kuwawezesha wananchi, kuimarisha uwazi, na kusaidia kujenga jamii bora.",

    password_tooWeak:
      "Nenosiri linahitaji angalau herufi 8 na liwemo herufi kubwa, herufi ndogo, nambari na alama maalum.",
  },
};

export default translations;
