// Публичные ссылки на юридические документы — нужны и в App Store Connect
// (Privacy Policy URL), и в самом приложении (Apple ожидает и то, и то).
// Размещены как публичный gist, а не GitHub Pages: репозиторий приватный, а
// Pages на бесплатном тарифе для приватных репозиториев недоступен
// (проверено — GitHub API отвечает 422 "Your current plan does not
// support..."). Gist не требует делать сам код приложения публичным.
//
// Исходники этих же текстов — docs/legal/privacy-policy.md и terms.md в
// корне репозитория; при правке менять там и здесь синхронно, потом
// пересоздавать gist (или редактировать существующий через `gh gist edit`).
const GIST_URL = 'https://gist.github.com/Nagiev217/8de971785c0dcf7facc1ec96c512abd0';

export const PRIVACY_POLICY_URL = `${GIST_URL}#file-privacy-policy-md`;
export const TERMS_URL = `${GIST_URL}#file-terms-md`;
