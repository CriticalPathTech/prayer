import md5 from 'blueimp-md5';

export function gravatarUrl(email: string, sizePx: number): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${sizePx}&d=404`;
}
