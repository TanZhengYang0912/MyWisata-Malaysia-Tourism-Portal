export type CitySuggestion = {
  id: string;
  name: string;
  admin1Code: string | null;
  countryCode: string;
};

export type ProfileLocationValue = {
  city: string;
  country: string;
  cityId: string | null;
  countryCode: string | null;
};
