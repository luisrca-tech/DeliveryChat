/**
 * Shared registry of gift-trial accounts.
 *
 * Both create-gift-trial-org.ts and delete-gift-trial-org.ts iterate over this
 * list. The create script skips any account that already exists; the delete
 * script tears down every account it finds. Accounts are matched by `subdomain`
 * (organization.slug) and `admin.email` — no IDs are pasted around.
 *
 * To hand out a new gift trial, add an entry here and run `gift-trial:create`.
 */

export type GiftTrialAccount = {
  companyName: string;
  subdomain: string;
  admin: {
    name: string;
    email: string;
    password: string;
  };
};

export const GIFT_TRIAL_ACCOUNTS: readonly GiftTrialAccount[] = [
  {
    companyName: "Okane Marketing Trial",
    subdomain: "okane-marketing",
    admin: {
      name: "Andrew Okane",
      email: "andrew@okn.trial",
      password: "Okanetrial123@",
    },
  },
  {
    companyName: "Naranja Labs Trial",
    subdomain: "naranja-labs",
    admin: {
      name: "Vitor Veloso",
      email: "vitor@naranja.trial",
      password: "Naranjatrial123",
    },
  },
];
