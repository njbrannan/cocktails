import Link from "next/link";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footerText: string;
  footerLink: string;
  footerLabel: string;
};

export function AuthCard({
  title,
  subtitle,
  children,
  footerText,
  footerLink,
  footerLabel,
}: AuthCardProps) {
  return (
    <div className="glass-panel mx-auto w-full max-w-md rounded-[32px] px-8 py-10">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-3xl text-[#6a2e2a]">{title}</h1>
        <p className="text-sm text-[#4b3f3a]">{subtitle}</p>
      </div>
      <div className="mt-8 space-y-4">{children}</div>
      <p className="mt-6 text-center text-xs text-[#4b3f3a]">
        {footerText} {" "}
        <Link className="font-semibold text-[#c47b4a]" href={footerLink}>
          {footerLabel}
        </Link>
      </p>
    </div>
  );
}
