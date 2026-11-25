import { useCallback } from 'react';
import { useAppBridge } from '../hooks/useAppBridge';
import { isEmbeddedAdmin, showAdminMessage } from './admin-feedback';
import { FeedbackPreviewPage, type FeedbackPreviewItem } from './feedback-preview';

const previewItems: FeedbackPreviewItem[] = [
  { id: 'simpler-campaign-copy', title: '支持快速复制现有活动', excerpt: '复制后保留商品范围和样式，只调整活动名称与档位。', status: 'approved', voteCount: 38, voted: false, createdAt: '2026-10-28', hasOfficialReply: true },
  { id: 'campaign-performance', title: '活动列表展示转化数据', excerpt: '希望在列表中直接查看活动带来的订单和销售额。', status: 'in_progress', voteCount: 27, voted: true, createdAt: '2026-10-26', hasOfficialReply: true },
  { id: 'tier-schedule', title: '按时间自动切换优惠档位', excerpt: '为促销期设置不同的数量和折扣档位。', status: 'pending', voteCount: 16, voted: false, createdAt: '2026-10-24', hasOfficialReply: false },
  { id: 'more-widget-layouts', title: '增加更多商品页组件布局', excerpt: '提供适合紧凑商品页的横向数量档位布局。', status: 'released', voteCount: 51, voted: false, createdAt: '2026-10-18', hasOfficialReply: true },
  { id: 'cart-progress', title: '购物车展示距下一档差额', excerpt: '在购物车中提示再购买多少件可以获得下一档优惠。', status: 'rejected', voteCount: 9, voted: false, createdAt: '2026-10-12', hasOfficialReply: true },
];

export function isFeedbackPreviewPath(pathname: string): boolean {
  return pathname === '/preview/feedback-board';
}

export default function FeedbackPreview(): JSX.Element {
  const app = useAppBridge();
  const notifySuccess = useCallback((message: string) => {
    if (isEmbeddedAdmin()) showAdminMessage(app, message, 'success');
  }, [app]);
  return <FeedbackPreviewPage items={previewItems} notifySuccess={notifySuccess} />;
}
