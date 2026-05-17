import { CliBrand } from "@/components/cli/CliBrand";
import { CliLink } from "@/components/cli/CliLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliShell } from "@/components/cli/CliShell";

export default function OnboardingPage() {
  return (
    <CliPage>
      <CliShell>
        <span>
          Welcome to the <CliBrand />!
        </span>
        <CliLink href="/login">Log In &gt;</CliLink>
        <CliLink href="/signup">Sign Up &gt;</CliLink>
        <CliShell.Blank />
        <span>## About Us</span>
        <span>We formed Loading for</span>
        <span>helping people to learn</span>
        <span>the basics of activity</span>
        <span>charts</span>
        <span>Loading Inc. © 2026</span>
      </CliShell>
    </CliPage>
  );
}
