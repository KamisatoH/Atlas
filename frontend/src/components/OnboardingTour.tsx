import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Button, Typography } from 'antd';
import { CompassOutlined, RightOutlined } from '@ant-design/icons';
import type { OnboardingStep, TourPlacement } from '@/config/onboardingSteps';

const { Text, Title } = Typography;

const TOOLTIP_W = 360;
const TOOLTIP_H = 240;

type Rect = { top: number; left: number; width: number; height: number };

function measureTarget(selector: string | undefined, padding: number): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

function computeTooltipPos(
  rect: Rect | null,
  placement: TourPlacement,
  tooltipW: number,
  tooltipH: number
): { top: number; left: number } {
  const margin = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect || placement === 'center') {
    return {
      top: Math.max(margin, (vh - tooltipH) / 2),
      left: Math.max(margin, (vw - tooltipW) / 2),
    };
  }

  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom':
      top = rect.top + rect.height + margin;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'top':
      top = rect.top - tooltipH - margin;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - tooltipW - margin;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left + rect.width + margin;
      break;
    default:
      break;
  }

  top = Math.max(margin, Math.min(top, vh - tooltipH - margin));
  left = Math.max(margin, Math.min(left, vw - tooltipW - margin));
  return { top, left };
}

export type OnboardingTourProps = {
  open: boolean;
  steps: OnboardingStep[];
  onFinish: () => void;
  onSkip: () => void;
};

export function OnboardingTour({ open, steps, onFinish, onSkip }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotRect, setSpotRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;
  const showSpotlight = Boolean(step?.target && spotRect && step.placement !== 'center');
  const isCenter = !showSpotlight;

  const refresh = useCallback(() => {
    if (!open || !step) return;
    const pad = step.padding ?? 8;
    const rect = measureTarget(step.target, pad);
    setSpotRect(rect);
    const useCenter = !step.target || step.placement === 'center' || (!rect && step.optional);
    const placement = useCenter ? 'center' : (step.placement ?? 'bottom');
    setTooltipPos(computeTooltipPos(useCenter ? null : rect, placement, TOOLTIP_W, TOOLTIP_H));
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open) return;
    refresh();
    const t = window.setTimeout(refresh, 120);
    return () => window.clearTimeout(t);
  }, [open, stepIndex, refresh]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => refresh();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onSkip]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setSpotRect(null);
      return;
    }
    document.body.classList.add('onboarding-active');
    return () => document.body.classList.remove('onboarding-active');
  }, [open]);

  const goNext = () => {
    if (isLast) onFinish();
    else setStepIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  if (!open || !step) return null;

  return (
    <div className="onboarding-root" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {!showSpotlight ? (
        <div className="onboarding-dim" aria-hidden />
      ) : (
        <div
          className="onboarding-spotlight"
          style={{
            top: spotRect!.top,
            left: spotRect!.left,
            width: spotRect!.width,
            height: spotRect!.height,
          }}
        />
      )}

      <div
        className={`onboarding-tooltip ${isCenter ? 'onboarding-tooltip--center' : ''}`}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className="onboarding-tooltip-header">
          <span className="onboarding-step-badge">
            <CompassOutlined />
            {stepIndex + 1} / {steps.length}
          </span>
        </div>
        <Title level={5} id="onboarding-title" className="!mb-2 !mt-0 !text-slate-800">
          {step.title}
        </Title>
        <Text className="block text-sm leading-relaxed text-slate-600">{step.description}</Text>

        <div className="onboarding-tooltip-actions">
          <Button type="link" size="small" className="!px-0 !text-slate-400" onClick={onSkip}>
            跳过教程
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button size="small" onClick={goPrev}>
                上一步
              </Button>
            )}
            <Button type="primary" size="small" icon={isLast ? undefined : <RightOutlined />} onClick={goNext}>
              {isLast ? '开始使用' : '下一步'}
            </Button>
          </div>
        </div>

        <div className="onboarding-dots" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.id} className={`onboarding-dot ${i === stepIndex ? 'is-active' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
