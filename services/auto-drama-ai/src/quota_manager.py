"""
配额管理模块
管理每日 Token 配额使用情况和统计数据
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class UsageRecord:
    """单次使用记录"""
    timestamp: str
    task_id: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_yuan: float
    video_duration: int
    status: str  # success / failed


@dataclass
class DailyStats:
    """每日统计数据"""
    date: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    total_tokens: int
    total_cost_yuan: float
    total_video_duration: int  # 总视频时长（秒）
    records: List[UsageRecord]


class QuotaManager:
    """
    配额管理器
    
    功能：
    1. 跟踪每日 Token 使用情况
    2. 记录每次视频生成的统计数据
    3. 检查是否超出配额
    4. 持久化统计数据到本地文件
    """
    
    def __init__(
        self,
        quota_file: Optional[str] = None,
        daily_quota: Optional[int] = None
    ):
        self.quota_file = Path(quota_file or os.getenv("QUOTA_FILE", "quota_stats.json"))
        self.daily_quota = daily_quota or int(os.getenv("DAILY_QUOTA", "4000000"))
        self._stats: Dict[str, DailyStats] = {}
        self._load_stats()
    
    def _load_stats(self):
        """从文件加载统计数据"""
        if self.quota_file.exists():
            try:
                with open(self.quota_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for date_str, stats_data in data.items():
                        records = [
                            UsageRecord(**record)
                            for record in stats_data.get('records', [])
                        ]
                        self._stats[date_str] = DailyStats(
                            date=stats_data['date'],
                            total_requests=stats_data['total_requests'],
                            successful_requests=stats_data['successful_requests'],
                            failed_requests=stats_data['failed_requests'],
                            total_tokens=stats_data['total_tokens'],
                            total_cost_yuan=stats_data['total_cost_yuan'],
                            total_video_duration=stats_data['total_video_duration'],
                            records=records
                        )
            except Exception as e:
                print(f"加载配额统计数据失败: {e}")
    
    def _save_stats(self):
        """保存统计数据到文件"""
        try:
            data = {
                date_str: {
                    **asdict(stats),
                    'records': [asdict(r) for r in stats.records]
                }
                for date_str, stats in self._stats.items()
            }
            with open(self.quota_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存配额统计数据失败: {e}")
    
    def _get_or_create_daily_stats(self, date_str: str) -> DailyStats:
        """获取或创建某日的统计数据"""
        if date_str not in self._stats:
            self._stats[date_str] = DailyStats(
                date=date_str,
                total_requests=0,
                successful_requests=0,
                failed_requests=0,
                total_tokens=0,
                total_cost_yuan=0.0,
                total_video_duration=0,
                records=[]
            )
        return self._stats[date_str]
    
    def get_today_stats(self) -> DailyStats:
        """获取今日统计数据"""
        today = date.today().isoformat()
        return self._get_or_create_daily_stats(today)
    
    def get_today_usage(self) -> Dict[str, any]:
        """获取今日使用情况概览"""
        stats = self.get_today_stats()
        remaining = self.daily_quota - stats.total_tokens
        usage_percent = (stats.total_tokens / self.daily_quota) * 100 if self.daily_quota > 0 else 0
        
        return {
            "date": stats.date,
            "daily_quota": self.daily_quota,
            "used_tokens": stats.total_tokens,
            "remaining_tokens": max(0, remaining),
            "usage_percent": round(usage_percent, 2),
            "total_requests": stats.total_requests,
            "successful_requests": stats.successful_requests,
            "failed_requests": stats.failed_requests,
            "total_cost_yuan": round(stats.total_cost_yuan, 2),
            "total_video_duration": stats.total_video_duration,
        }
    
    def check_quota(self, estimated_tokens: int = 1000) -> bool:
        """
        检查是否还有足够配额
        
        Args:
            estimated_tokens: 预估需要的 Token 数
        
        Returns:
            bool: 是否有足够配额
        """
        stats = self.get_today_stats()
        return (stats.total_tokens + estimated_tokens) <= self.daily_quota
    
    def record_usage(
        self,
        task_id: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        cost_yuan: float,
        video_duration: int,
        status: str = "success"
    ):
        """
        记录一次使用情况
        
        Args:
            task_id: 任务 ID
            model: 使用的模型
            prompt_tokens: 提示词 Token 数
            completion_tokens: 生成内容 Token 数
            cost_yuan: 成本（元）
            video_duration: 视频时长（秒）
            status: 任务状态
        """
        today = date.today().isoformat()
        stats = self._get_or_create_daily_stats(today)
        
        total_tokens = prompt_tokens + completion_tokens
        
        # 创建记录
        record = UsageRecord(
            timestamp=datetime.now().isoformat(),
            task_id=task_id,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_yuan=cost_yuan,
            video_duration=video_duration,
            status=status
        )
        
        # 更新统计数据
        stats.records.append(record)
        stats.total_requests += 1
        stats.total_tokens += total_tokens
        stats.total_cost_yuan += cost_yuan
        stats.total_video_duration += video_duration
        
        if status == "success":
            stats.successful_requests += 1
        else:
            stats.failed_requests += 1
        
        # 保存到文件
        self._save_stats()
    
    def get_history_stats(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[DailyStats]:
        """
        获取历史统计数据
        
        Args:
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
        
        Returns:
            List[DailyStats]: 每日统计数据列表
        """
        if start_date is None:
            start_date = "1970-01-01"
        if end_date is None:
            end_date = date.today().isoformat()
        
        result = []
        for date_str, stats in sorted(self._stats.items()):
            if start_date <= date_str <= end_date:
                result.append(stats)
        
        return result
    
    def get_summary(self) -> Dict[str, any]:
        """获取总体统计摘要"""
        total_requests = sum(s.total_requests for s in self._stats.values())
        successful_requests = sum(s.successful_requests for s in self._stats.values())
        failed_requests = sum(s.failed_requests for s in self._stats.values())
        total_tokens = sum(s.total_tokens for s in self._stats.values())
        total_cost = sum(s.total_cost_yuan for s in self._stats.values())
        total_duration = sum(s.total_video_duration for s in self._stats.values())
        
        return {
            "total_days": len(self._stats),
            "total_requests": total_requests,
            "successful_requests": successful_requests,
            "failed_requests": failed_requests,
            "success_rate": round(successful_requests / total_requests * 100, 2) if total_requests > 0 else 0,
            "total_tokens": total_tokens,
            "total_cost_yuan": round(total_cost, 2),
            "total_video_duration": total_duration,
            "average_cost_per_video": round(total_cost / successful_requests, 2) if successful_requests > 0 else 0,
        }
    
    def reset_today_stats(self):
        """重置今日统计数据（谨慎使用）"""
        today = date.today().isoformat()
        if today in self._stats:
            del self._stats[today]
            self._save_stats()


# 全局配额管理器实例
_quota_manager: Optional[QuotaManager] = None


def get_quota_manager() -> QuotaManager:
    """获取全局配额管理器实例"""
    global _quota_manager
    if _quota_manager is None:
        _quota_manager = QuotaManager()
    return _quota_manager
