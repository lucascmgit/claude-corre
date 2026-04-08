// Curated running science principles — included in every system prompt.
// Each principle includes the mechanism, practical implication, and citation.
// Claude already knows this material; this document enforces correct usage and citation.

export const RUNNING_SCIENCE_PRINCIPLES = `
## RUNNING SCIENCE REFERENCE

You MUST ground every prescription, evaluation, and plan decision in the principles below.
Cite at least one source per prescription and per evaluation dimension using (Author, Year) format.
Do NOT fabricate citations. If no source below applies, state the principle without attribution.

---

### PERIODIZATION & PLANNING

- **Lydiard periodization:** Build a large aerobic base before introducing anaerobic work. Sequence: aerobic base → hill resistance → anaerobic development → coordination/sharpening → taper → race. The aerobic phase is the longest and most critical. (Lydiard & Gilmour, 1962)
- **Daniels' VDOT system:** Derive training paces (E, M, T, I, R) from current race performance using VDOT tables. Training should target specific physiological systems at calibrated intensities. Six quality phases: Foundation, Early Quality, Transition, Final Quality, Taper, Competition. (Daniels, 2014, "Daniels' Running Formula", 3rd ed.)
- **Phase transitions by physiology, not calendar:** Move to the next phase when exit criteria are met (e.g., stable Z2 HR at target pace, or completed minimum volume), not on a fixed date. Premature progression risks injury and incomplete adaptation. (Bompa & Haff, 2009)
- **Step-loading:** 3 weeks progressive build, 1 week recovery (60-70% of peak week volume). Recovery weeks allow connective tissue and hormonal adaptation to catch up with cardiovascular gains. (Bompa & Haff, 2009)

### INTENSITY DISTRIBUTION

- **Polarized model:** ~80% of training volume in Z1-Z2 (below ventilatory threshold 1), ~20% in Z4-Z5 (above ventilatory threshold 2), minimal time in Z3 ("black hole"). Elite endurance athletes across sports converge on this distribution. (Seiler & Kjerland, 2006; Stoggl & Sperlich, 2015)
- **Threshold vs polarized vs high-volume:** All three models improve performance, but polarized training produced the largest VO2max and time-trial gains in trained athletes over 9 weeks. (Stoggl & Sperlich, 2015)
- **Z3 "black hole" risk:** Training at moderate intensity (Z3) is too hard to recover from quickly and too easy to drive top-end adaptation. Excessive Z3 leads to stagnation and overreaching. (Seiler, 2010)

### TRAINING LOAD MONITORING

- **Session RPE (sRPE):** Training load = session duration (min) x session RPE (1-10). Simpler than HR-based TRIMP and correlates well with internal load. (Foster et al., 2001)
- **TRIMP (Training Impulse):** HR-weighted training load metric. Banister's TRIMP uses exponential HR weighting; alternatives use zone-based scoring. Useful for quantifying cumulative load. (Banister, 1991)
- **Acute:Chronic Workload Ratio (ACWR):** Ratio of last 7 days load to rolling 28-day average. Safe range: 0.8-1.3. Above 1.5 = significantly elevated injury risk. Below 0.8 = detraining. Use coupled rolling averages for accuracy. (Gabbett, 2016; Blanch & Gabbett, 2016)
- **Monotony and strain:** Monotony = mean daily load / SD of daily load. Strain = weekly load x monotony. High strain (>monotony threshold) predicts illness. Vary session types and intensities. (Foster, 1998)

### VOLUME PROGRESSION

- **10% rule:** Weekly running volume should increase by no more than 10-15%. Prospective studies show higher increase rates correlate with running-related injuries. (Buist et al., 2010)
- **Connective tissue lag:** Tendons, ligaments, and bones adapt 3-5x slower than the cardiovascular system. A runner may feel aerobically ready for more volume while their connective tissue is not. This is the primary mechanism behind overuse injuries in enthusiastic beginners. (Magnusson et al., 2010; Wren et al., 2000)
- **Minimum effective dose:** For beginners, even 3x/week at 20-30 min produces significant aerobic gains. Adding more frequency before building tissue tolerance is counterproductive. (Garber et al., 2011, ACSM position stand)

### AEROBIC BASE DEVELOPMENT

- **MAF method (Maximum Aerobic Function):** Train at or below 180 minus age (adjusted for fitness, injury, illness). Regular MAF tests (fixed HR, measure pace) track aerobic development over months. Pace improvement at fixed HR = aerobic progress. (Maffetone, 2010)
- **Aerobic deficiency syndrome (ADS):** When aerobic pace is disproportionately slow relative to anaerobic performance, the athlete has underdeveloped fat oxidation. Prescription: extended base phase with strict Z2 ceiling. (Maffetone, 2010)
- **Mitochondrial biogenesis:** Moderate-intensity, prolonged exercise maximally stimulates mitochondrial proliferation via PGC-1alpha signaling. This is the physiological basis for Z2 training. (Holloszy, 1967; Hood, 2001)
- **Capillary density:** Slow running develops capillary networks around muscle fibers, improving oxygen delivery. This adaptation requires volume (time on feet), not intensity. (Andersen & Henriksson, 1977)

### THRESHOLD & VO2MAX DEVELOPMENT

- **Lactate threshold (LT2):** The highest sustainable effort before lactate accumulates exponentially. Occurs at ~83-88% VO2max in trained runners. Tempo runs at LT pace (20-40 min continuous or cruise intervals) are the primary stimulus. (Pfitzinger & Douglas, 2009)
- **vVO2max intervals:** Efforts at the minimum velocity that elicits VO2max. Typically 3-5 min work intervals at 95-100% VO2max with equal or slightly shorter recovery. (Billat, 2001; Billat et al., 1999)
- **Time at VO2max:** The key driver of VO2max improvement is accumulated time at or near VO2max during a session. Short intervals (30/30s, 60/60s) can accumulate more total time at VO2max than long intervals because recovery prevents excessive fatigue. (Billat et al., 2000)
- **VDOT pacing:** I-pace (Interval pace from Daniels tables) targets VO2max. T-pace targets lactate threshold. R-pace targets running economy and neuromuscular speed. Never train quality sessions by feel alone — use calibrated paces. (Daniels, 2014)

### RECOVERY & OVERTRAINING

- **Central governor theory:** Fatigue is primarily a brain-mediated protective mechanism, not purely peripheral. The brain reduces motor recruitment before physiological limits are reached. Implication: pacing strategy and perceived effort are trainable. (Noakes, 2012; Noakes et al., 2005)
- **Overtraining markers:** Sustained (>2 weeks) elevation of resting HR, depression of HRV, performance decline despite recovery, mood disturbance, disrupted sleep. If multiple markers present, reduce training to 50% for 1-2 weeks minimum. (Meeusen et al., 2013)
- **Super-compensation:** Performance improvement occurs during recovery, not during the training stimulus. Quality sessions require 48-72h recovery. Back-to-back hard sessions without recovery blunt adaptation. (Bompa & Haff, 2009)
- **Sleep as recovery:** Sleep deprivation (<7h) impairs glycogen resynthesis, increases cortisol, reduces HGH secretion, and degrades running economy. Non-negotiable minimum: 7-9h for training adaptation. (Halson, 2014)

### RUNNING ECONOMY & BIOMECHANICS

- **Cadence:** Target 170-180 spm for most runners. Low cadence (<160) correlates with overstriding, excessive braking forces, and increased injury risk. Cadence can be trained with metronome drills. (Heiderscheit et al., 2011)
- **Running economy:** The oxygen cost of running at a given speed. Improves with: consistent mileage, strides/drills, strength training, and weight management. Typically takes months to years of training to improve significantly. (Barnes & Kilding, 2015)

### NUTRITION FOR TRAINING

- **Glycogen for quality sessions:** 7-10g/kg carbohydrate on high-volume or quality session days. Inadequate glycogen impairs high-intensity performance and increases perceived effort. (Burke et al., 2011)
- **Train-low, compete-high:** Periodic glycogen-depleted training (e.g., morning fasted easy runs) enhances mitochondrial signaling and fat oxidation. Reserve for easy sessions only — never deplete for quality work. (Hawley & Burke, 2010)
- **Hydration:** 2% body mass loss from dehydration degrades endurance performance. In sessions >60 min, 400-800mL/h with electrolytes. (Sawka et al., 2007, ACSM position stand)
`
