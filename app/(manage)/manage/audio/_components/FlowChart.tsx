"use client";

import { CalendarDaysIcon, HeadphonesIcon, RadioTowerIcon } from "lucide-react";
import { motion } from "framer-motion";

export function FlowChart() {
  const baseAnimationConfig = {
    scale: [1, null, 1.1, 1, null],
    backgroundColor: [
      "color-mix(in oklab, var(--primary) 20%, transparent)",
      null,
      "color-mix(in oklab, var(--primary) 40%, transparent)",
      "color-mix(in oklab, var(--primary) 20%, transparent)",
      null,
    ],
    transition: {
      duration: 3,
      times: [0, 0, 0.1, 0.2, 1],
      repeat: Infinity,
    },
  };
  const animationConfigWithRepeatDelay = (delayInSeconds: number) => {
    return {
      ...baseAnimationConfig,
      transition: {
        ...baseAnimationConfig.transition,
        delay: delayInSeconds,
      },
    };
  };
  return (
    <div className="bg-background rounded-2xl grid grid-rows-3 md:grid-rows-none md:grid-cols-3 gap-2 md:gap-1 p-3 relative">
      <div className="hidden md:block absolute z-1 h-2 bg-foreground/5 top-7 left-[16.66%] right-[16.66%] overflow-hidden">
        <motion.div
          className="h-6 w-6 bg-primary blur-md absolute -translate-x-1/2 top-1/2 -translate-y-1/2"
          animate={{
            left: ["0%", "100%"],
            transition: {
              duration: 3,
              times: [0, 1],
              repeat: Infinity,
            },
          }}
        ></motion.div>
      </div>
      <div className="block md:hidden absolute z-1 w-2 bg-foreground/5 left-12 top-[16.66%] bottom-[16.66%] overflow-hidden">
        <motion.div
          className="h-6 w-6 bg-primary blur-md absolute -translate-y-1/2 left-1/2 -translate-x-1/2"
          animate={{
            top: ["0%", "100%"],
            transition: {
              duration: 3,
              times: [0, 1],
              repeat: Infinity,
            },
          }}
        ></motion.div>
      </div>
      <div className="flex flex-row md:flex-col gap-2 items-start md:items-center relative z-2">
        <motion.div
          animate={animationConfigWithRepeatDelay(0)}
          className="h-10 w-20 rounded-full text-primary flex items-center justify-center backdrop-blur-md shrink-0"
        >
          <CalendarDaysIcon className="size-5" />
        </motion.div>
        <div className="flex flex-col items-start md:items-center">
          <span className="text-left md:text-center text-foreground text-xl font-medium font-instrument italic">
            Choose an event
          </span>
          <p className="text-left md:text-center text-pretty">
            Add date, place, location and people involved.
          </p>
        </div>
      </div>
      <div className="flex flex-row md:flex-col gap-2 items-start md:items-center relative z-2">
        <motion.div
          className="h-10 w-20 rounded-full text-primary flex items-center justify-center backdrop-blur-md shrink-0"
          animate={animationConfigWithRepeatDelay(1)}
        >
          <RadioTowerIcon className="size-5" />
        </motion.div>
        <div className="flex flex-col items-start md:items-center">
          <span className="text-left md:text-center text-foreground text-xl font-medium font-instrument italic">
            Add device info
          </span>
          <p className="text-left md:text-center text-pretty">
            Add the device model and other info.
          </p>
        </div>
      </div>
      <div className="flex flex-row md:flex-col gap-2 items-start md:items-center relative z-2">
        <motion.div
          className="h-10 w-20 rounded-full bg-primary/20 text-primary flex items-center justify-center backdrop-blur-md shrink-0"
          // extra 0.1 second to account for ease out of the shimmer
          animate={animationConfigWithRepeatDelay(2.1)}
        >
          <HeadphonesIcon className="size-5" />
        </motion.div>
        <div className="flex flex-col items-start md:items-center">
          <span className="text-left md:text-center text-foreground text-xl font-medium font-instrument italic">
            Upload audio
          </span>
          <p className="text-left md:text-center text-pretty">
            Upload the data recorded by the device.
          </p>
        </div>
      </div>
    </div>
  );
}
