import React from "react";
import { useLanguage } from "../context/LanguageContext";

function About() {
  const { t } = useLanguage();
  return (
    <div>
      <h2>{t("about_title")}</h2>
      <p>{t("about_body")}</p>
    </div>
  );
}

export default About;
