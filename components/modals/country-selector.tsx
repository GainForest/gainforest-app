import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModal } from "@/components/ui/modal/context";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { countries, type Country } from "@/app/_lib/countries";
import { cn } from "@/lib/utils";
import { forwardRef, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const allCountries = Object.entries(countries);

const CountrySelectorModal = ({
  initialCountryCode,
  onCountryChange,
}: {
  initialCountryCode: string;
  onCountryChange: (country: string) => void;
}) => {
  const t = useTranslations("modals.countrySelector");
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const { popModal, stack, hide } = useModal();
  const selectedCountryRef = useRef<HTMLButtonElement>(null);

  const handleDone = (country: string) => {
    onCountryChange(country);
    if (stack.length === 1) {
      hide().then(() => {
        popModal();
      });
    } else {
      popModal();
    }
  };

  const [searchText, setSearchText] = useState("");
  const filteredCountries = allCountries.filter(([, countryData]) => {
    return countryData.name.toLowerCase().includes(searchText.toLowerCase());
  });

  // Scroll to selected country when modal opens
  useEffect(() => {
    if (selectedCountryRef.current && searchText === "") {
      selectedCountryRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [searchText]);
  return (
    <ModalContent>
      <ModalHeader>
        <ModalTitle>{t("title")}</ModalTitle>
        <ModalDescription>
          {t("description")}
        </ModalDescription>
      </ModalHeader>
      <Input
        placeholder={t("searchPlaceholder")}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      <div className="relative mt-2">
        <div className="w-full max-h-[max(45vh,500px)] overflow-y-auto overflow-x-hidden rounded-xl">
          <div className="grid grid-cols-2 gap-2 my-4">
            {filteredCountries.map((c) => {
              const isSelected = c[0] === countryCode;
              return (
                <CountryButton
                  key={c[0]}
                  ref={isSelected ? selectedCountryRef : null}
                  countryCode={c[0]}
                  countryData={c[1]}
                  selectedCountry={countryCode}
                  onClick={() => setCountryCode(c[0])}
                />
              );
            })}
          </div>
        </div>
        <div className="absolute top-0 h-[4%] bg-linear-to-b from-background to-transparent w-full z-5 rounded-t-xl"></div>
        <div className="absolute bottom-0 h-[4%] bg-linear-to-t from-foreground/10 to-transparent w-full z-5 rounded-b-xl"></div>
      </div>

      <ModalFooter className="mt-4 flex justify-end">
        <Button onClick={() => handleDone(countryCode)}>{t("done")}</Button>
      </ModalFooter>
    </ModalContent>
  );
};

const CountryButton = forwardRef<
  HTMLButtonElement,
  {
    countryCode: string;
    countryData: Country;
    selectedCountry: string;
    onClick: () => void;
  }
>(({ countryCode, countryData, selectedCountry, onClick }, ref) => {
  return (
    <Button
      ref={ref}
      variant={"secondary"}
      className={cn(
        "flex flex-col h-auto items-start justify-between gap-0 px-2 py-1 text-wrap border-2 border-transparent rounded-xl bg-background shadow-none",
        countryCode === selectedCountry &&
        "border-primary text-primary bg-primary/10 hover:bg-primary/15"
      )}
      onClick={onClick}
    >
      <span className="text-2xl">{countryData.emoji}</span>
      <span className="text-base truncate">
        {countryData.name.length > 16
          ? countryData.name.slice(0, 16) + "..."
          : countryData.name}
      </span>
    </Button>
  );
});

CountryButton.displayName = "CountryButton";

export default CountrySelectorModal;
