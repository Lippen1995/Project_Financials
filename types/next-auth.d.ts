import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      subscriptionPlan?: string;
      subscriptionStatus?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    subscriptionPlan?: string;
    subscriptionStatus?: string;
  }
}