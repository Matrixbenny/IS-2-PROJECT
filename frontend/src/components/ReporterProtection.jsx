import React from 'react';
import { useLanguage } from '../context/LanguageContext';

// People hesitate to report corruption because they fear what happens to them.
// This panel answers that before they write anything. It names the laws by title
// only (no section numbers) and is general information, not legal advice.
const COPY = {
  en: {
    summary: 'Is it safe to report? Read this first',
    points: [
      'You do not need an account or your name. If you report without signing in, Kenya Watch keeps nothing that identifies you.',
      'Photos you upload have their location and device details removed before they are stored, and file names are replaced.',
      'Kenyan law protects people who report corruption in good faith, including the Bribery Act, 2016 and the Anti-Corruption and Economic Crimes Act, 2003. The Witness Protection Act, 2006 provides protection for witnesses whose lives are at risk.',
      'Do not confront the person you are reporting, and do not put yourself in danger to collect proof. Report what you saw or were asked to do.',
      'If you are in immediate danger, call 999 or 112 first.'
    ],
    note: 'This is general information, not legal advice. Kenya Watch cannot guarantee the outcome of a case, but it will show you what happens to it.'
  },
  sw: {
    summary: 'Je, ni salama kuripoti? Soma hii kwanza',
    points: [
      'Huhitaji akaunti wala jina lako. Ukiripoti bila kuingia, Kenya Watch haihifadhi chochote kinachokutambulisha.',
      'Picha unazopakia huondolewa taarifa za mahali zilipopigwa na kifaa kabla ya kuhifadhiwa, na majina ya faili hubadilishwa.',
      'Sheria za Kenya zinawalinda watu wanaoripoti ufisadi kwa nia njema, zikiwemo Sheria ya Hongo ya 2016 na Sheria ya Kupambana na Ufisadi na Uhalifu wa Kiuchumi ya 2003. Sheria ya Ulinzi wa Mashahidi ya 2006 inatoa ulinzi kwa mashahidi ambao maisha yao yamo hatarini.',
      'Usimkabili unayemripoti, na usijiweke hatarini ili kupata ushahidi. Ripoti ulichoona au ulichoombwa kufanya.',
      'Ukiwa katika hatari ya haraka, piga 999 au 112 kwanza.'
    ],
    note: 'Haya ni maelezo ya jumla, si ushauri wa kisheria. Kenya Watch haiwezi kuahidi matokeo ya kesi, lakini itakuonyesha kinachotokea.'
  }
};

export default function ReporterProtection() {
  const { language } = useLanguage();
  const copy = COPY[language] || COPY.en;
  return (
    <details className="kw-page-card kw-protection">
      <summary><strong>{copy.summary}</strong></summary>
      <ul>
        {copy.points.map((point) => <li key={point}>{point}</li>)}
      </ul>
      <p className="kw-helper">{copy.note}</p>
    </details>
  );
}
