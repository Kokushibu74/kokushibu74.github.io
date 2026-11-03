#!/usr/bin/env python3
import re, unittest
TERMS=re.compile(r"(নিহত|মৃত্যু|খুন|হত্যা|সংঘর্ষ|গণঅভ্যুত্থান|গণভোট|ঘূর্ণিঝড়|ঘূর্ণিঝড়|বন্যা|ভূমিকম্প|জলোচ্ছ্বাস|killed|murder|clash|uprising|referendum|cyclone|flood|earthquake|storm|disaster)",re.I)
BD=re.compile(r"(বাংলাদেশ|ঢাকা|চট্টগ্রাম|bangladesh|dhaka|chattogram)",re.I)
FOLLOW=re.compile(r"(বার্ষিকী|anniversary|years? ago|তদন্ত চলছে|investigation into)",re.I)
def qualifies(title, summary="", is_breaking=True, age_minutes=10):
    text=f"{title} {summary}"
    return bool(is_breaking and -5<=age_minutes<=60 and TERMS.search(text) and BD.search(text) and not FOLLOW.search(text))
class NewsAlertTests(unittest.TestCase):
    def test_death_alert(self): self.assertTrue(qualifies("ঢাকায় বাস দুর্ঘটনায় ৫ জন নিহত"))
    def test_disaster_alert(self): self.assertTrue(qualifies("Bangladesh cyclone warning issued for coastal districts"))
    def test_requires_breaking_flag(self): self.assertFalse(qualifies("ঢাকায় ৫ জন নিহত", is_breaking=False))
    def test_rejects_old_story(self): self.assertFalse(qualifies("ঢাকায় ৫ জন নিহত", age_minutes=90))
    def test_rejects_history(self): self.assertFalse(qualifies("ঢাকার ঘটনার বার্ষিকী", summary="anniversary"))
    def test_rejects_non_bd(self): self.assertFalse(qualifies("Major earthquake kills people in Chile"))
if __name__=="__main__": unittest.main(verbosity=2)
