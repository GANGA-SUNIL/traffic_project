import React from 'react';

export default function WhatIfPanel({ settings = {}, onChange }) {
  const defaultSettings = {
    rain: false,
    blockage: false,
    peak: false
  };

  const handleRun = () => {
    onChange && onChange(defaultSettings);
  };

  
}
