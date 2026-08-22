"""
Feature extraction from HealthKit data.

Converts raw health data samples into features used for state inference.
"""

import statistics
from datetime import datetime, timezone
from typing import Dict, List, Optional

from ..healthkit.ingestion import HealthDataSample, HealthMetricType


class FeatureExtractor:
    """Extracts features from health data samples."""

    @staticmethod
    def extract_heart_rate_features(samples: List[HealthDataSample]) -> Dict:
        """
        Extract heart rate features.

        Args:
            samples: List of heart rate samples

        Returns:
            Dictionary of features
        """
        if not samples:
            return {
                "mean_hr": None,
                "min_hr": None,
                "max_hr": None,
                "std_hr": None,
                "data_available": False,
            }

        values = [s.value for s in samples]

        return {
            "mean_hr": statistics.mean(values),
            "min_hr": min(values),
            "max_hr": max(values),
            "std_hr": statistics.stdev(values) if len(values) > 1 else 0,
            "sample_count": len(values),
            "data_available": True,
        }

    @staticmethod
    def extract_hrv_features(samples: List[HealthDataSample]) -> Dict:
        """
        Extract HRV features.

        Args:
            samples: List of HRV samples

        Returns:
            Dictionary of features
        """
        if not samples:
            return {
                "mean_hrv": None,
                "min_hrv": None,
                "max_hrv": None,
                "data_available": False,
            }

        values = [s.value for s in samples]

        return {
            "mean_hrv": statistics.mean(values),
            "min_hrv": min(values),
            "max_hrv": max(values),
            "std_hrv": statistics.stdev(values) if len(values) > 1 else 0,
            "sample_count": len(values),
            "data_available": True,
        }

    @staticmethod
    def extract_activity_features(
        steps_samples: List[HealthDataSample], energy_samples: List[HealthDataSample]
    ) -> Dict:
        """
        Extract activity level features.

        Args:
            steps_samples: List of step count samples
            energy_samples: List of active energy samples

        Returns:
            Dictionary of features
        """
        features = {}

        if steps_samples:
            total_steps = sum(s.value for s in steps_samples)
            features["total_steps"] = total_steps
            features["avg_steps_per_hour"] = (
                total_steps / len(steps_samples) if steps_samples else 0
            )
        else:
            features["total_steps"] = None
            features["avg_steps_per_hour"] = None

        if energy_samples:
            total_energy = sum(s.value for s in energy_samples)
            features["total_active_energy"] = total_energy
            features["avg_energy_per_hour"] = (
                total_energy / len(energy_samples) if energy_samples else 0
            )
        else:
            features["total_active_energy"] = None
            features["avg_energy_per_hour"] = None

        features["data_available"] = bool(steps_samples or energy_samples)

        return features

    @staticmethod
    def extract_respiratory_features(samples: List[HealthDataSample]) -> Dict:
        """
        Extract respiratory rate features.

        Args:
            samples: List of respiratory rate samples

        Returns:
            Dictionary of features
        """
        if not samples:
            return {"mean_respiratory_rate": None, "data_available": False}

        values = [s.value for s in samples]

        return {
            "mean_respiratory_rate": statistics.mean(values),
            "min_respiratory_rate": min(values),
            "max_respiratory_rate": max(values),
            "std_respiratory_rate": statistics.stdev(values) if len(values) > 1 else 0,
            "sample_count": len(values),
            "data_available": True,
        }

    @staticmethod
    def compute_activation_score(
        hr_features: Dict,
        hrv_features: Dict,
        activity_features: Dict,
        baselines: Optional[Dict[str, Dict]] = None,
        window_hours: float = 4.0,
    ) -> float:
        """
        Compute activation score as a proxy for stress/arousal level.

        Uses rolling user baselines when available, falling back to population
        defaults when baselines are not yet established.

        Args:
            hr_features: Heart rate features
            hrv_features: HRV features
            activity_features: Activity features
            baselines: Optional dict of baselines keyed by metric name.
                       Each value has 'baseline_mean' and 'baseline_std'.

        Returns:
            Activation score (0-100)
        """
        score = 50.0

        if baselines is None:
            baselines = {}

        hr_baseline = baselines.get("heart_rate", {})
        hr_mean = hr_baseline.get("baseline_mean", 70)
        hr_std = hr_baseline.get("baseline_std", 0)

        hrv_baseline = baselines.get("hrv", {})
        hrv_mean = hrv_baseline.get("baseline_mean", 50)
        hrv_std = hrv_baseline.get("baseline_std", 0)

        if hr_features.get("data_available"):
            mean_hr = hr_features.get("mean_hr", hr_mean)
            if hr_std > 0:
                hr_deviation = FeatureExtractor.compute_metric_deviation(
                    mean_hr, hr_mean, hr_std
                )
                hr_component = hr_deviation * 10
            else:
                hr_component = (mean_hr - hr_mean) / max(hr_mean, 1) * 30
            score += hr_component

        if hrv_features.get("data_available"):
            mean_hrv = hrv_features.get("mean_hrv", hrv_mean)
            if hrv_std > 0:
                hrv_deviation = FeatureExtractor.compute_metric_deviation(
                    mean_hrv, hrv_mean, hrv_std
                )
                hrv_component = -hrv_deviation * 8
            else:
                hrv_component = (hrv_mean - mean_hrv) / max(hrv_mean, 1) * 20
            score += hrv_component

        if activity_features.get("data_available"):
            total_steps = activity_features.get("total_steps", 0) or 0
            # Normalize to hourly rate so the activation component is
            # independent of the data window length.
            steps_per_hour = total_steps / max(window_hours, 0.1)
            activity_component = min(steps_per_hour / 500 * 15, 15)
            score += activity_component

        return max(0, min(100, score))

    @staticmethod
    def extract_intraday_features(
        health_data: Dict[str, List[HealthDataSample]],
        baselines: Optional[Dict[str, Dict]] = None,
        window_hours: float = 4.0,
    ) -> Dict:
        """
        Extract all intraday features from health data.

        Args:
            health_data: Dictionary mapping metric type to samples
            baselines: Optional dict of user baselines keyed by metric name

        Returns:
            Dictionary of extracted features
        """
        hr_samples = health_data.get("heart_rate", [])
        hrv_samples = health_data.get("heart_rate_variability", [])
        steps_samples = health_data.get("step_count", [])
        energy_samples = health_data.get("active_energy_burned", [])
        resp_samples = health_data.get("respiratory_rate", [])

        hr_features = FeatureExtractor.extract_heart_rate_features(hr_samples)
        hrv_features = FeatureExtractor.extract_hrv_features(hrv_samples)
        activity_features = FeatureExtractor.extract_activity_features(
            steps_samples, energy_samples
        )
        resp_features = FeatureExtractor.extract_respiratory_features(resp_samples)

        activation_score = FeatureExtractor.compute_activation_score(
            hr_features, hrv_features, activity_features, baselines, window_hours
        )

        has_sensor_data = (
            hr_features.get("data_available", False)
            or hrv_features.get("data_available", False)
            or activity_features.get("data_available", False)
            or resp_features.get("data_available", False)
        )
        source_quality = "data_verified" if has_sensor_data else "fallback"

        # Phase 1: Include separate feature references for independent Yin/Yang scoring
        yin_yang_features = {
            "hrv_features": hrv_features,
            "hr_features": hr_features,
            "activity_features": activity_features,
        }

        return {
            "heart_rate": hr_features,
            "hrv": hrv_features,
            "activity": activity_features,
            "respiratory": resp_features,
            "activation_score": activation_score,
            "yin_yang_features": yin_yang_features,
            "source_quality": source_quality,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def compute_metric_deviation(
        current_value: float, baseline_mean: float, baseline_std: float
    ) -> float:
        """
        Compute normalized deviation from baseline.

        Args:
            current_value: Current metric value
            baseline_mean: Baseline mean
            baseline_std: Baseline standard deviation

        Returns:
            Normalized deviation (z-score)
        """
        if baseline_std == 0:
            return 0.0

        return (current_value - baseline_mean) / baseline_std

    @staticmethod
    def update_rolling_baseline(
        current_mean: float,
        current_std: float,
        current_count: int,
        new_value: float,
        max_window: int = 168,
    ) -> tuple:
        """
        Update a rolling baseline with a new observation using exponential moving average.

        Args:
            current_mean: Current baseline mean
            current_std: Current baseline standard deviation
            current_count: Number of samples in the baseline
            new_value: New observed value
            max_window: Maximum effective window size (default 168 = 7 days * 24 hours)

        Returns:
            Tuple of (new_mean, new_std, new_count)
        """
        new_count = min(current_count + 1, max_window)
        alpha = 1.0 / new_count

        new_mean = current_mean + alpha * (new_value - current_mean)
        new_var = (1 - alpha) * (current_std ** 2 + alpha * (new_value - current_mean) ** 2)
        new_std = max(new_var ** 0.5, 0.01)

        return (new_mean, new_std, new_count)

    @staticmethod
    def normalize_for_wuxing(
        features: Dict,
        baselines: Optional[Dict[str, Dict]] = None,
    ) -> Dict[str, Optional[float]]:
        """Convert extracted features + baselines into flat keys for wuxing scoring.

        Args:
            features: Output of extract_intraday_features().
            baselines: User baselines keyed by metric name, each with
                       'baseline_mean' and 'baseline_std'.

        Returns:
            Flat dict with keys matching wuxing.infer_states() expectations.
        """
        if baselines is None:
            baselines = {}

        hr = features.get("heart_rate", {})
        hrv = features.get("hrv", {})
        activity = features.get("activity", {})
        respiratory = features.get("respiratory", {})

        out: Dict[str, Optional[float]] = {}

        # --- HRV ratio to baseline ---
        mean_hrv = hrv.get("mean_hrv")
        hrv_bl = baselines.get("hrv", {})
        hrv_bl_mean = hrv_bl.get("baseline_mean")
        if mean_hrv is not None and hrv_bl_mean and hrv_bl_mean > 0:
            out["hrv_ratio_to_baseline"] = mean_hrv / hrv_bl_mean
        else:
            out["hrv_ratio_to_baseline"] = None

        # --- HR coefficient of variation ---
        mean_hr = hr.get("mean_hr")
        std_hr = hr.get("std_hr")
        if mean_hr and mean_hr > 0 and std_hr is not None:
            out["hr_cv"] = std_hr / mean_hr
        else:
            out["hr_cv"] = None
        out["hr_cv_at_rest"] = out["hr_cv"]

        # --- Resting HR ratio to baseline ---
        hr_bl = baselines.get("heart_rate", {})
        hr_bl_mean = hr_bl.get("baseline_mean")
        if mean_hr is not None and hr_bl_mean and hr_bl_mean > 0:
            out["resting_hr_ratio_to_baseline"] = mean_hr / hr_bl_mean
        else:
            out["resting_hr_ratio_to_baseline"] = None

        # --- Steps ratio to baseline (population default ~7000 steps/day ≈ 1200/4h) ---
        total_steps = activity.get("total_steps")
        steps_default = 1200.0
        if total_steps is not None:
            out["steps_ratio_to_baseline"] = total_steps / steps_default
        else:
            out["steps_ratio_to_baseline"] = None

        # --- Active energy ratio (population default ~120 kcal/4h) ---
        total_energy = activity.get("total_active_energy")
        energy_default = 120.0
        if total_energy is not None:
            out["active_energy_ratio"] = total_energy / energy_default
        else:
            out["active_energy_ratio"] = None

        # --- Respiratory rate deviation (normalized 0-1) ---
        mean_rr = respiratory.get("mean_respiratory_rate")
        std_rr = respiratory.get("std_respiratory_rate")
        rr_bl = baselines.get("respiratory_rate", {})
        rr_bl_mean = rr_bl.get("baseline_mean", 16.0)
        if mean_rr is not None and rr_bl_mean:
            out["resp_rate_deviation"] = min(1.0, abs(mean_rr - rr_bl_mean) / 6.0)
        else:
            out["resp_rate_deviation"] = None

        # --- Breath variability (from respiratory std, normalized 0-1) ---
        if std_rr is not None:
            out["breath_variability"] = min(1.0, std_rr / 4.0)
        else:
            out["breath_variability"] = None

        # Signals not available from HealthKit (screen time, social, location, trends)
        out["movement_entropy"] = None
        out["screen_hours"] = None
        out["late_screen_hours"] = None
        out["social_app_ratio"] = None
        out["home_ratio"] = None
        out["sedentary_bout_hours"] = None
        out["hrv_trend_ratio_2w"] = None
        out["resting_hr_trend_ratio"] = None
        out["steps_trend_ratio_2w"] = None

        return out

    @staticmethod
    def extract_nightly_features(
        health_data: Dict[str, List[HealthDataSample]],
    ) -> Dict:
        """
        Extract nightly/sleep features from health data for daily state computation.

        Args:
            health_data: Dictionary mapping metric type to samples
                         (should include sleep_analysis and resting_heart_rate)

        Returns:
            Dictionary of nightly features
        """
        sleep_samples = health_data.get("sleep_analysis", [])
        resting_hr_samples = health_data.get("resting_heart_rate", [])
        hrv_samples = health_data.get("heart_rate_variability", [])

        features = {
            "sleep": {"data_available": False},
            "resting_heart_rate": {"data_available": False},
            "overnight_hrv": {"data_available": False},
        }

        if sleep_samples:
            sleep_hours = [s.value for s in sleep_samples]
            features["sleep"] = {
                "total_sleep_hours": sum(sleep_hours),
                "avg_sleep_hours": statistics.mean(sleep_hours) if sleep_hours else 0,
                "session_count": len(sleep_hours),
                "data_available": True,
            }

        if resting_hr_samples:
            rhr_values = [s.value for s in resting_hr_samples]
            features["resting_heart_rate"] = {
                "mean_resting_hr": statistics.mean(rhr_values),
                "min_resting_hr": min(rhr_values),
                "max_resting_hr": max(rhr_values),
                "sample_count": len(rhr_values),
                "data_available": True,
            }

        if hrv_samples:
            hrv_values = [s.value for s in hrv_samples]
            features["overnight_hrv"] = {
                "mean_hrv": statistics.mean(hrv_values),
                "min_hrv": min(hrv_values),
                "max_hrv": max(hrv_values),
                "sample_count": len(hrv_values),
                "data_available": True,
            }

        features["timestamp"] = datetime.now(timezone.utc).isoformat()
        return features
