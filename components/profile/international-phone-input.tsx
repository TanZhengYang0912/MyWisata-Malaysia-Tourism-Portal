"use client";

import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

interface InternationalPhoneInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}

export function InternationalPhoneInput({
  id,
  value,
  onChange,
  disabled,
  error,
}: InternationalPhoneInputProps) {
  return (
    <PhoneInput
      defaultCountry="my"
      value={value}
      onChange={(nextPhone) => onChange(nextPhone)}
      disabled={disabled}
      inputProps={{
        id,
        name: id,
        type: "tel",
        autoComplete: "tel",
        "aria-invalid": error || undefined,
      }}
      inputClassName={error ? "!border-destructive" : undefined}
    />
  );
}
