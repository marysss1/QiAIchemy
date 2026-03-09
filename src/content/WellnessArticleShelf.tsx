import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type WellnessArticleContentBlock =
  | {
      kind: 'paragraph';
      text: string;
    }
  | {
      kind: 'image';
      imageUrl: string;
      caption?: string;
    };

export type WellnessArticle = {
  slug: string;
  title: string;
  summary: string;
  author?: string;
  sourceName: string;
  sourceSection: string;
  sourceDomain: string;
  sourceUrl: string;
  publishedAt?: string;
  coverImageUrl?: string;
  contentBlocks: WellnessArticleContentBlock[];
  tags: string[];
  updatedAt?: string;
};

type WellnessArticleShelfProps = {
  articles: WellnessArticle[];
  error: string;
  loading: boolean;
  lastSyncedAt: string | null;
  onRefresh: () => void;
};

function formatDate(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }
  return parsed.toLocaleDateString('zh-CN');
}

export function WellnessArticleShelf({
  articles,
  error,
  loading,
  lastSyncedAt,
  onRefresh,
}: WellnessArticleShelfProps): React.JSX.Element {
  const [selectedArticle, setSelectedArticle] = useState<WellnessArticle | null>(null);

  const articleDismissResponder = useMemo(
    () => {
      let isHorizontalSwipe = false;

      return PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          isHorizontalSwipe =
            Math.abs(gestureState.dx) > 18 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) + 8;
          return isHorizontalSwipe;
        },
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
          isHorizontalSwipe =
            Math.abs(gestureState.dx) > 18 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) + 8;
          return isHorizontalSwipe;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gestureState) => {
          if (isHorizontalSwipe && gestureState.dx <= -72) {
            setSelectedArticle(null);
          }
          isHorizontalSwipe = false;
        },
      });
    },
    []
  );

  return (
    <>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>中青年养生秘笈</Text>
            <Text style={styles.meta}>
              围绕中青年养生、控糖、作息与代谢的官方内容
              {lastSyncedAt ? ` · 最近更新 ${formatDate(lastSyncedAt)}` : ''}
            </Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={onRefresh} disabled={loading}>
            <Text style={styles.refreshButtonText}>{loading ? '更新中' : '更新文章'}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading && articles.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#a53c32" />
            <Text style={styles.loadingText}>正在抓取权威中青年养生文章…</Text>
          </View>
        ) : articles.length > 0 ? (
          <View style={styles.articleList}>
            {articles.map((article) => (
              <Pressable key={article.slug} style={styles.articleCard} onPress={() => setSelectedArticle(article)}>
                {article.coverImageUrl ? (
                  <Image source={{ uri: article.coverImageUrl }} style={styles.coverImage} />
                ) : (
                  <View style={styles.coverFallback}>
                    <Text style={styles.coverFallbackText}>{article.sourceName}</Text>
                  </View>
                )}
                <View style={styles.articleBody}>
                  <Text style={styles.articleTitle}>{article.title}</Text>
                  <Text style={styles.articleSource}>
                    {article.sourceName} · {article.sourceSection}
                  </Text>
                  <Text style={styles.articleSummary}>{article.summary}</Text>
                  <View style={styles.tagRow}>
                    {article.tags.slice(0, 3).map((tag) => (
                      <View key={`${article.slug}-${tag}`} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>暂时还没有可展示的权威养生文章。</Text>
        )}
      </View>

      <Modal
        visible={Boolean(selectedArticle)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedArticle(null)}
      >
        {selectedArticle ? (
          <SafeAreaView style={styles.readerScreen} {...articleDismissResponder.panHandlers}>
            <View style={styles.readerHeader}>
              <View style={styles.readerHeaderTextWrap}>
                <Text style={styles.readerEyebrow}>左滑返回</Text>
                <Text style={styles.readerTitle}>{selectedArticle.title}</Text>
                <Text style={styles.readerMeta}>
                  {selectedArticle.sourceName} · {selectedArticle.sourceSection} · {formatDate(selectedArticle.publishedAt)}
                </Text>
              </View>
              <Pressable style={styles.readerCloseButton} onPress={() => setSelectedArticle(null)}>
                <Text style={styles.readerCloseText}>关闭</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.readerScroll}
              contentContainerStyle={styles.readerScrollContent}
              contentInsetAdjustmentBehavior="automatic"
            >
              {selectedArticle.coverImageUrl ? (
                <Image source={{ uri: selectedArticle.coverImageUrl }} style={styles.readerHeroImage} />
              ) : null}

              <View style={styles.readerSourceCard}>
                <Text style={styles.readerSourceLabel}>来源</Text>
                <Text style={styles.readerSourceText}>{selectedArticle.sourceName}</Text>
                <Text style={styles.readerSourceSub}>
                  结构化整理自官方文章，原文链接与出处保留在下方。
                </Text>
              </View>

              {selectedArticle.contentBlocks.map((block, index) => {
                if (block.kind === 'image') {
                  return (
                    <View key={`${selectedArticle.slug}-img-${index}`} style={styles.readerImageWrap}>
                      <Image source={{ uri: block.imageUrl }} style={styles.readerInlineImage} />
                      {block.caption ? <Text style={styles.readerImageCaption}>{block.caption}</Text> : null}
                    </View>
                  );
                }

                return (
                  <Text key={`${selectedArticle.slug}-p-${index}`} style={styles.readerParagraph}>
                    {block.text}
                  </Text>
                );
              })}

              <Pressable style={styles.sourceButton} onPress={() => Linking.openURL(selectedArticle.sourceUrl)}>
                <Text style={styles.sourceButtonText}>查看原文出处</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#dcc8ab',
    borderRadius: 18,
    backgroundColor: '#fffaf1',
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: '#5b3921',
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    color: '#8a735d',
    fontSize: 12,
    lineHeight: 18,
  },
  refreshButton: {
    minWidth: 70,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c99f70',
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8efe1',
  },
  refreshButtonText: {
    color: '#8d4a34',
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#ad4139',
    fontSize: 13,
    lineHeight: 20,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    color: '#755743',
    fontSize: 13,
  },
  articleList: {
    gap: 14,
  },
  articleCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2d1b6',
    backgroundColor: '#fffdf8',
  },
  coverImage: {
    width: '100%',
    height: 154,
    backgroundColor: '#ead9c0',
  },
  coverFallback: {
    width: '100%',
    height: 154,
    backgroundColor: '#ead9c0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  coverFallbackText: {
    color: '#7a5c45',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  articleBody: {
    padding: 14,
  },
  articleTitle: {
    color: '#4e3220',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  articleSource: {
    marginTop: 6,
    color: '#8d7057',
    fontSize: 12,
  },
  articleSummary: {
    marginTop: 8,
    color: '#5f4a39',
    fontSize: 14,
    lineHeight: 22,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tagChip: {
    borderRadius: 999,
    backgroundColor: '#f4ead7',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: {
    color: '#8c6547',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    color: '#7a614c',
    fontSize: 14,
    lineHeight: 22,
  },
  readerScreen: {
    flex: 1,
    backgroundColor: '#f6eddd',
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(123, 92, 66, 0.15)',
  },
  readerHeaderTextWrap: {
    flex: 1,
  },
  readerEyebrow: {
    color: '#9a7258',
    fontSize: 11,
    letterSpacing: 1,
  },
  readerTitle: {
    marginTop: 6,
    color: '#4a2d1d',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  readerMeta: {
    marginTop: 8,
    color: '#8d7057',
    fontSize: 12,
    lineHeight: 18,
  },
  readerCloseButton: {
    minWidth: 74,
    borderRadius: 999,
    backgroundColor: '#b83d31',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  readerCloseText: {
    color: '#fffaf3',
    fontSize: 13,
    fontWeight: '700',
  },
  readerScroll: {
    flex: 1,
  },
  readerScrollContent: {
    padding: 18,
    paddingBottom: 42,
  },
  readerHeroImage: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    backgroundColor: '#ead9c0',
  },
  readerSourceCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e1d0b4',
    backgroundColor: '#fffaf2',
    padding: 14,
  },
  readerSourceLabel: {
    color: '#8c6547',
    fontSize: 12,
    fontWeight: '700',
  },
  readerSourceText: {
    marginTop: 6,
    color: '#4e3220',
    fontSize: 16,
    fontWeight: '700',
  },
  readerSourceSub: {
    marginTop: 8,
    color: '#7b624d',
    fontSize: 13,
    lineHeight: 20,
  },
  readerImageWrap: {
    marginTop: 16,
  },
  readerInlineImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: '#ead9c0',
  },
  readerImageCaption: {
    marginTop: 8,
    color: '#8d725c',
    fontSize: 12,
    textAlign: 'center',
  },
  readerParagraph: {
    marginTop: 16,
    color: '#4f3b2b',
    fontSize: 16,
    lineHeight: 28,
  },
  sourceButton: {
    marginTop: 22,
    borderRadius: 16,
    backgroundColor: '#b53b2f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  sourceButtonText: {
    color: '#fff7ef',
    fontSize: 15,
    fontWeight: '700',
  },
});
