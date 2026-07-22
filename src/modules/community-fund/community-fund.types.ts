export interface ZoneStat {
  id: string;
  name: string;
  slug: string;
  targetContributors: number;
  currentContributors: number;
  targetAmountBdt: number;
  currentAmountBdt: number;
  progressPercent: number;
  carePartnerMembers: number;
}

export interface CommunityFundOverview {
  totalContributors: number;
  totalAmountBdt: number;
  totalActiveCards: number;
  zones: {
    id: string;
    name: string;
    slug: string;
    targetContributors: number;
    currentContributors: number;
    targetAmountBdt: number;
    currentAmountBdt: number;
    progressPercent: number;
    clinicAddress: string | null;
    coverImage: { id: string; url: string; altText: string | null } | null;
  }[];
}

export interface PublicContributor {
  id: string;
  contributionNumber: string;
  displayName: string;
  isAnonymous: boolean;
  zoneName: string;
  createdAt: string;
}

export interface PublicImpactStats {
  strayAnimalsSupported: number;
  animalsVaccinated: number;
  rescueCasesSupported: number;
  feedingProgramsRun: number;
  lowIncomeFamiliesAssisted: number;
  totalContributors: number;
  totalZones: number;
}

export interface CommunityFundDashboard {
  totalContributors: number;
  totalAmountBdt: number;
  totalCards: number;
  totalActiveCards: number;
  totalCensusSubmissions: number;
  zones: ZoneStat[];
  recentContributions: {
    id: string;
    contributionNumber: string;
    contributorName: string | null;
    zoneName: string;
    amountBdt: number;
    status: string;
    createdAt: Date;
  }[];
}
